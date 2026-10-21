import * as vscode from 'vscode';
import {
  BLOCKED_ISSUES,
  classifyError,
  decideAction,
  skipReason,
  type RepoSnapshot,
} from './decide';
import type { Repository } from './git';
import { readConfigFlags } from './gitConfig';
import { detectInProgress } from './inProgress';
import type { Logger } from './log';
import { summarizeError, type SyncOutcome, type SyncPhase } from './outcome';

/**
 * Syncs one repository at a time: fetch the current branch, then pull if strictly behind
 * or push if strictly ahead. It never forces, merges, rebases on its own or sets an upstream.
 */
export class RepoSyncer {
  private readonly running = new Set<string>();

  constructor(private readonly log: Pick<Logger, 'info'>) {}

  async sync(repository: Repository): Promise<SyncOutcome> {
    const root = repository.rootUri.fsPath;
    if (this.running.has(root)) {
      return { status: 'skipped', reason: 'busy' };
    }
    this.running.add(root);
    try {
      return await this.run(repository);
    } catch (err) {
      return failed('fetch', err);
    } finally {
      this.running.delete(root);
    }
  }

  private async run(repository: Repository): Promise<SyncOutcome> {
    // Refresh the extension's cached state, which can be stale after changes made outside VS Code.
    await repository.status();
    let snapshot = await readSnapshot(repository);
    const skip = skipReason(snapshot);
    if (skip) {
      return { status: 'skipped', reason: skip };
    }
    const branch = snapshot.branch as string;
    const upstream = snapshot.upstream as { remote: string; name: string };

    try {
      await repository.fetch({ remote: upstream.remote, ref: upstream.name });
    } catch (err) {
      return failed('fetch', err);
    }

    // Read from git again: fetching changes ahead and behind, and the user may have switched branches meanwhile.
    snapshot = await readSnapshot(repository);
    if (snapshot.branch !== branch) {
      return { status: 'skipped', reason: 'changed' };
    }
    const skipAfter = skipReason(snapshot);
    if (skipAfter) {
      return { status: 'skipped', reason: skipAfter };
    }

    const action = decideAction(snapshot, await readContext(repository));
    switch (action.type) {
      case 'none':
        return { status: 'up-to-date' };
      case 'blocked':
        return { status: 'blocked', reason: action.reason, issue: BLOCKED_ISSUES[action.reason] };
      case 'pull':
        try {
          await repository.pull();
        } catch (err) {
          return failed('pull', err);
        }
        return { status: 'pulled', commits: snapshot.behind ?? 0 };
      case 'push':
        try {
          // An explicit refspec makes the push go to the upstream branch even if its name differs.
          await repository.push(snapshot.upstream?.remote, `${branch}:${snapshot.upstream?.name}`, false);
        } catch (err) {
          return failed('push', err);
        }
        return { status: 'pushed', commits: snapshot.ahead ?? 0 };
    }
  }
}

async function readSnapshot(repository: Repository): Promise<RepoSnapshot> {
  const root = repository.rootUri.fsPath;
  const state = repository.state;
  const snapshot: RepoSnapshot = { hasRemote: state.remotes.length > 0 };

  const head = await repository.getBranch('HEAD');
  if (head.name) {
    snapshot.branch = head.name;
    try {
      const branch = await repository.getBranch(head.name);
      snapshot.upstream = branch.upstream && { remote: branch.upstream.remote, name: branch.upstream.name };
      snapshot.ahead = branch.ahead;
      snapshot.behind = branch.behind;
    } catch {
      // A branch with no commits yet has no ref to read.
    }
  }

  snapshot.inProgress =
    (await detectInProgress(root)) ?? (state.rebaseCommit ? 'rebase' : state.mergeChanges.length > 0 ? 'merge' : undefined);
  return snapshot;
}

async function readContext(repository: Repository) {
  const configs = await repository.getConfigs().catch(() => []);
  const flags = readConfigFlags(configs);
  const state = repository.state;
  return {
    mergeFfDisabled: flags.mergeFfDisabled,
    autoStash:
      flags.autoStash || vscode.workspace.getConfiguration('git', repository.rootUri).get<boolean>('autoStash', false),
    dirty: state.indexChanges.length > 0 || state.workingTreeChanges.length > 0 || state.mergeChanges.length > 0,
  };
}

function failed(phase: SyncPhase, err: unknown): SyncOutcome {
  const e = (err ?? {}) as { gitErrorCode?: string; stderr?: string; message?: string };
  const text = [e.stderr, e.message].filter(Boolean).join('\n');
  return {
    status: 'failed',
    phase,
    issue: { kind: classifyError(e.gitErrorCode, phase, text), message: summarizeError(text) },
  };
}

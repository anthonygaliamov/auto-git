import * as vscode from 'vscode';
import type { API, Repository } from './git';
import type { Logger } from './log';
import { realKey } from './paths';
import { invalidEntries, isSelected } from './repoFilter';
import { findRepos } from './scan';
import { isEnabledFor, readSettings } from './settings';

/**
 * Works out which repositories should be synced, and opens them in the Git extension.
 * Candidates are repos found in the workspace folders plus anything in `autoGit.includeRepos`.
 */
export class RepoDiscovery implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changed = new vscode.EventEmitter<readonly Repository[]>();
  private repositories: Repository[] = [];
  private running: Promise<void> | undefined;
  private rerun = false;

  readonly onDidChange = this.changed.event;

  constructor(
    private readonly api: API,
    private readonly log: Logger,
  ) {
    this.disposables.push(
      this.changed,
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('autoGit')) {
          void this.refresh();
        }
      }),
    );
  }

  /** Repositories currently selected for syncing. */
  getRepositories(): readonly Repository[] {
    return this.repositories;
  }

  /** Rescans. Calls made while a scan is running are merged into one follow-up scan. */
  refresh(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        try {
          await this.scan();
        } catch (err) {
          this.log.info(`Repository scan failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } while (this.rerun);
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async scan(): Promise<void> {
    const settings = readSettings();
    for (const entry of [...invalidEntries(settings.include), ...invalidEntries(settings.exclude)]) {
      this.log.info(`Ignoring "${entry}" in autoGit settings: repository paths must be absolute.`);
    }

    const candidates = new Map<string, string>();
    const add = async (repoPath: string): Promise<void> => {
      candidates.set(await realKey(repoPath), repoPath);
    };

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme !== 'file') {
        continue;
      }
      for (const repoPath of await findRepos(folder.uri.fsPath, settings.scanDepth)) {
        await add(repoPath);
      }
    }
    for (const repoPath of settings.include) {
      if (invalidEntries([repoPath]).length === 0) {
        await add(repoPath);
      }
    }

    const selected = new Map<string, Repository>();
    for (const [key, repoPath] of candidates) {
      if (!isSelected(repoPath, settings) || !isEnabledFor(repoPath)) {
        continue;
      }
      const repository = await this.api.openRepository(vscode.Uri.file(repoPath));
      if (!repository) {
        this.log.info(`Could not open ${repoPath} as a git repository.`);
        continue;
      }
      if ((await realKey(repository.rootUri.fsPath)) !== key) {
        this.log.info(`Skipping ${repoPath}: the Git extension resolved it to ${repository.rootUri.fsPath}.`);
        continue;
      }
      selected.set(key, repository);
    }

    const next = [...selected.values()].sort((a, b) => a.rootUri.fsPath.localeCompare(b.rootUri.fsPath));
    const before = this.repositories.map((r) => r.rootUri.fsPath).join('\n');
    const after = next.map((r) => r.rootUri.fsPath).join('\n');
    this.repositories = next;
    if (before !== after) {
      this.log.info(`Tracking ${next.length} repositor${next.length === 1 ? 'y' : 'ies'}.`);
      for (const r of next) {
        this.log.info(`  ${r.rootUri.fsPath}`);
      }
      this.changed.fire(next);
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}

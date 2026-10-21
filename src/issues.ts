import * as path from 'node:path';
import type { IssueKind } from './decide';
import type { SyncOutcome } from './outcome';

export interface RepoIssue {
  root: string;
  kind: IssueKind;
  /** Identifies the problem, so a different problem on the same repo counts as new. */
  key: string;
  message: string;
  /** Worth a pop-up. Everything else only shows in the status bar. */
  notify: boolean;
}

export const KIND_LABELS: Record<IssueKind, string> = {
  diverged: 'Diverged',
  'push-rejected': 'Push rejected',
  auth: 'Authentication failed',
  network: 'Network error',
  'local-changes': 'Local changes in the way',
  config: 'Git configuration',
  error: 'Error',
};

export const repoName = (root: string): string => path.basename(root) || root;

/** Every repo whose latest outcome needs a human, sorted by path. */
export function collectIssues(results: ReadonlyMap<string, SyncOutcome>): RepoIssue[] {
  const issues: RepoIssue[] = [];
  for (const [root, outcome] of results) {
    if (outcome.status === 'blocked') {
      issues.push({
        root,
        kind: outcome.issue.kind,
        key: `blocked:${outcome.reason}`,
        message: outcome.issue.message,
        notify: outcome.issue.kind === 'diverged' || outcome.reason === 'merge-ff-disabled',
      });
    } else if (outcome.status === 'failed') {
      issues.push({
        root,
        kind: outcome.issue.kind,
        key: `failed:${outcome.phase}:${outcome.issue.kind}`,
        message: outcome.issue.message,
        notify: outcome.issue.kind === 'push-rejected' || outcome.issue.kind === 'auth',
      });
    }
  }
  return issues.sort((a, b) => a.root.localeCompare(b.root));
}

/** Repos on a branch with no upstream. Not a problem, but the user may want to know nothing is pushed. */
export function collectLocalOnly(results: ReadonlyMap<string, SyncOutcome>): string[] {
  return [...results]
    .filter(([, o]) => o.status === 'skipped' && o.reason === 'no-upstream')
    .map(([root]) => root)
    .sort((a, b) => a.localeCompare(b));
}

export type StatusState = 'syncing' | 'issues' | 'paused' | 'idle';

export interface StatusInput {
  repoCount: number;
  syncing: boolean;
  paused: boolean;
  issues: readonly RepoIssue[];
  localOnly: readonly string[];
  /** Already formatted for display. */
  lastSync?: string;
}

export interface StatusModel {
  visible: boolean;
  state: StatusState;
  text: string;
  tooltip: string;
  /** What a click should do. */
  command: 'showIssues' | 'showLog';
}

const MAX_LISTED = 8;

function list(lines: readonly string[]): string[] {
  const shown = lines.slice(0, MAX_LISTED).map((l) => `  - ${l}`);
  if (lines.length > MAX_LISTED) {
    shown.push(`  - and ${lines.length - MAX_LISTED} more`);
  }
  return shown;
}

export function buildStatus(input: StatusInput): StatusModel {
  const { repoCount, syncing, paused, issues, localOnly, lastSync } = input;
  const state: StatusState = syncing ? 'syncing' : issues.length > 0 ? 'issues' : paused ? 'paused' : 'idle';

  const text = {
    syncing: '$(sync~spin) Auto Sync',
    issues: `$(warning) Auto Sync ${issues.length}`,
    paused: '$(debug-pause) Auto Sync',
    idle: '$(sync) Auto Sync',
  }[state];

  const lines = ['Auto Sync'];
  if (paused) {
    lines.push('Paused: automatic syncing is off.');
  }
  if (syncing) {
    lines.push('Syncing...');
  }
  lines.push(
    `Tracking ${repoCount} repositor${repoCount === 1 ? 'y' : 'ies'}.` + (lastSync ? ` Last sync ${lastSync}.` : ''),
  );
  if (issues.length > 0) {
    lines.push('', 'Needs attention:', ...list(issues.map((i) => `${repoName(i.root)}: ${KIND_LABELS[i.kind]}. ${i.message}`)));
  }
  if (localOnly.length > 0) {
    lines.push('', 'On a local-only branch, nothing is pushed:', ...list(localOnly.map(repoName)));
  }
  lines.push('', issues.length > 0 ? 'Click to review the issues.' : 'Click to open the log.');

  return {
    visible: repoCount > 0,
    state,
    text,
    tooltip: lines.join('\n'),
    command: issues.length > 0 ? 'showIssues' : 'showLog',
  };
}

/**
 * Remembers which problems the user has already been told about. A problem is reported once,
 * and again only after it has cleared and come back, or changed into a different problem.
 */
export class NotificationTracker {
  private readonly told = new Map<string, string>();

  /** Returns the issues that have not been reported yet. */
  next(issues: readonly RepoIssue[]): RepoIssue[] {
    const current = new Map(issues.filter((i) => i.notify).map((i) => [i.root, i]));
    for (const [root, key] of this.told) {
      if (current.get(root)?.key !== key) {
        this.told.delete(root);
      }
    }
    const fresh: RepoIssue[] = [];
    for (const issue of current.values()) {
      if (!this.told.has(issue.root)) {
        this.told.set(issue.root, issue.key);
        fresh.push(issue);
      }
    }
    return fresh;
  }
}

export function describeNotification(fresh: readonly RepoIssue[]): string {
  if (fresh.length === 1) {
    return `Auto Sync: ${repoName(fresh[0].root)}: ${fresh[0].message}`;
  }
  return `Auto Sync: ${fresh.length} repositories need attention.`;
}

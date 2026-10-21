import type { BlockedReason, IssueKind, SkipReason } from './decide';

export interface Issue {
  kind: IssueKind;
  message: string;
}

export type SyncPhase = 'fetch' | 'pull' | 'push';

export type SyncOutcome =
  | { status: 'skipped'; reason: SkipReason }
  | { status: 'up-to-date' }
  | { status: 'pulled'; commits: number }
  | { status: 'pushed'; commits: number }
  | { status: 'blocked'; reason: BlockedReason; issue: Issue }
  | { status: 'failed'; phase: SyncPhase; issue: Issue };

const SKIP_TEXT: Record<SkipReason, string> = {
  busy: 'a sync is already running',
  'no-remote': 'no remote configured',
  detached: 'HEAD is detached',
  'in-progress': 'a merge, rebase, cherry-pick or revert is in progress',
  'no-upstream': 'the branch has no upstream (local only)',
  changed: 'the branch changed during the sync',
};

const plural = (n: number): string => `${n} commit${n === 1 ? '' : 's'}`;

export function describeOutcome(outcome: SyncOutcome): string {
  switch (outcome.status) {
    case 'skipped':
      return `skipped: ${SKIP_TEXT[outcome.reason]}`;
    case 'up-to-date':
      return 'up to date';
    case 'pulled':
      return `pulled ${plural(outcome.commits)}`;
    case 'pushed':
      return `pushed ${plural(outcome.commits)}`;
    case 'blocked':
      return `needs attention: ${outcome.issue.message}`;
    case 'failed':
      return `${outcome.phase} failed (${outcome.issue.kind}): ${outcome.issue.message}`;
  }
}

/** Picks the most useful line of git output: the first `fatal:` or `error:` line, else the first non-empty line. */
export function summarizeError(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const line = lines.find((l) => /^(fatal|error):/i.test(l)) ?? lines[0] ?? 'Unknown error';
  return line.length > 300 ? `${line.slice(0, 297)}...` : line;
}

export interface RunSummary {
  total: number;
  pulled: number;
  pushed: number;
  upToDate: number;
  skipped: number;
  needAttention: number;
}

export function summarizeRun(outcomes: readonly SyncOutcome[]): RunSummary {
  const summary: RunSummary = { total: outcomes.length, pulled: 0, pushed: 0, upToDate: 0, skipped: 0, needAttention: 0 };
  for (const outcome of outcomes) {
    switch (outcome.status) {
      case 'pulled':
        summary.pulled++;
        break;
      case 'pushed':
        summary.pushed++;
        break;
      case 'up-to-date':
        summary.upToDate++;
        break;
      case 'skipped':
        summary.skipped++;
        break;
      case 'blocked':
      case 'failed':
        summary.needAttention++;
        break;
    }
  }
  return summary;
}

export function describeSummary(s: RunSummary): string {
  if (s.total === 0) {
    return 'No repositories to sync.';
  }
  const parts = [
    s.pulled && `${s.pulled} pulled`,
    s.pushed && `${s.pushed} pushed`,
    s.upToDate && `${s.upToDate} up to date`,
    s.skipped && `${s.skipped} skipped`,
    s.needAttention && `${s.needAttention} need${s.needAttention === 1 ? 's' : ''} attention`,
  ].filter(Boolean);
  return `Checked ${s.total} repositor${s.total === 1 ? 'y' : 'ies'}: ${parts.join(', ')}.`;
}

/**
 * Automatic runs would otherwise write the same line for every repo every few minutes.
 * They log changes, activity, and recoveries. Manual runs log everything.
 */
export function shouldLog(previous: SyncOutcome | undefined, next: SyncOutcome, manual: boolean): boolean {
  if (manual || next.status === 'pulled' || next.status === 'pushed') {
    return true;
  }
  if (next.status === 'up-to-date') {
    return previous?.status === 'failed' || previous?.status === 'blocked';
  }
  return !previous || describeOutcome(previous) !== describeOutcome(next);
}

/** What a repository looks like right now, reduced to what the sync decision needs. */
export interface RepoSnapshot {
  hasRemote: boolean;
  /** Undefined when HEAD is detached or the branch has no commits yet. */
  branch?: string;
  upstream?: { remote: string; name: string };
  ahead?: number;
  behind?: number;
  inProgress?: InProgressOperation;
}

export type InProgressOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

export type SkipReason = 'busy' | 'no-remote' | 'detached' | 'in-progress' | 'no-upstream' | 'changed';

export type BlockedReason = 'diverged' | 'merge-ff-disabled' | 'autostash-dirty';

export type Action = { type: 'none' } | { type: 'pull' } | { type: 'push' } | { type: 'blocked'; reason: BlockedReason };

export interface ActionContext {
  /** A fast-forward `git pull` would still create a merge commit (`merge.ff` or `pull.ff` is false). */
  mergeFfDisabled: boolean;
  /** `git.autoStash` is on, so a pull would stash and re-apply local changes. */
  autoStash: boolean;
  /** Staged or unstaged changes to tracked files. */
  dirty: boolean;
}

/** Checked before fetching. Returns why the repo should be left alone, if it should. */
export function skipReason(s: RepoSnapshot): SkipReason | undefined {
  if (!s.hasRemote) {
    return 'no-remote';
  }
  if (!s.branch) {
    return 'detached';
  }
  if (s.inProgress) {
    return 'in-progress';
  }
  // A remote of "." means the branch tracks another local branch, so there is nothing to fetch or push.
  if (!s.upstream || s.upstream.remote === '.') {
    return 'no-upstream';
  }
  return undefined;
}

/**
 * Checked after fetching, once ahead and behind are up to date.
 * Pull happens only when strictly behind (a fast-forward), push only when strictly ahead.
 */
export function decideAction(s: RepoSnapshot, ctx: ActionContext): Action {
  const ahead = s.ahead ?? 0;
  const behind = s.behind ?? 0;

  if (ahead > 0 && behind > 0) {
    return { type: 'blocked', reason: 'diverged' };
  }
  if (behind > 0) {
    if (ctx.mergeFfDisabled) {
      return { type: 'blocked', reason: 'merge-ff-disabled' };
    }
    if (ctx.autoStash && ctx.dirty) {
      return { type: 'blocked', reason: 'autostash-dirty' };
    }
    return { type: 'pull' };
  }
  if (ahead > 0) {
    return { type: 'push' };
  }
  return { type: 'none' };
}

export type IssueKind = 'diverged' | 'push-rejected' | 'auth' | 'network' | 'local-changes' | 'config' | 'error';

export const BLOCKED_ISSUES: Record<BlockedReason, { kind: IssueKind; message: string }> = {
  diverged: {
    kind: 'diverged',
    message: 'The branch has diverged from its upstream. Resolve it manually.',
  },
  'merge-ff-disabled': {
    kind: 'config',
    message: 'merge.ff or pull.ff is false, so pulling would create a merge commit. Pull skipped.',
  },
  'autostash-dirty': {
    kind: 'config',
    message: 'git.autoStash is on and the working tree has changes, so pulling could leave conflicts. Pull skipped.',
  },
};

const LOCAL_CHANGES_TEXT = /local changes to the following files would be overwritten|untracked working tree files would be overwritten/i;

const AUTH_TEXT =
  /authentication failed|permission denied \(|could not read (username|password)|terminal prompts disabled|invalid credentials|returned error: 40[13]/i;

/**
 * Maps a Git extension error to an issue kind. `phase` matters because only a push can be rejected.
 * `text` is the raw git output: the extension misses some auth failures, such as SSH keys being refused.
 */
export function classifyError(code: string | undefined, phase: 'fetch' | 'pull' | 'push', text = ''): IssueKind {
  if (AUTH_TEXT.test(text)) {
    return 'auth';
  }
  if (LOCAL_CHANGES_TEXT.test(text)) {
    return 'local-changes';
  }
  switch (code) {
    case 'AuthenticationFailed':
    case 'PermissionDenied':
      return 'auth';
    case 'RemoteConnectionError':
    case 'CantAccessRemote':
    case 'RepositoryNotFound':
      return 'network';
    case 'PushRejected':
    case 'ForcePushWithLeaseRejected':
    case 'ForcePushWithLeaseIfIncludesRejected':
      return phase === 'push' ? 'push-rejected' : 'error';
    case 'LocalChangesOverwritten':
    case 'DirtyWorkTree':
    case 'UnmergedChanges':
    case 'Conflict':
      return 'local-changes';
    default:
      return 'error';
  }
}

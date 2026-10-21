import * as assert from 'node:assert';
import { classifyError, decideAction, skipReason, type ActionContext, type RepoSnapshot } from '../../src/decide';

const base: RepoSnapshot = {
  hasRemote: true,
  branch: 'main',
  upstream: { remote: 'origin', name: 'main' },
  ahead: 0,
  behind: 0,
};
const ctx: ActionContext = { mergeFfDisabled: false, autoStash: false, dirty: false };

describe('skipReason', () => {
  it('lets a normal repo through', () => {
    assert.strictEqual(skipReason(base), undefined);
  });

  it('skips repos without a remote', () => {
    assert.strictEqual(skipReason({ ...base, hasRemote: false }), 'no-remote');
  });

  it('skips a detached HEAD', () => {
    assert.strictEqual(skipReason({ ...base, branch: undefined }), 'detached');
  });

  it('skips while a merge, rebase, cherry-pick or revert is in progress', () => {
    for (const inProgress of ['merge', 'rebase', 'cherry-pick', 'revert'] as const) {
      assert.strictEqual(skipReason({ ...base, inProgress }), 'in-progress');
    }
  });

  it('skips branches without an upstream', () => {
    assert.strictEqual(skipReason({ ...base, upstream: undefined }), 'no-upstream');
  });

  it('skips branches that track another local branch', () => {
    assert.strictEqual(skipReason({ ...base, upstream: { remote: '.', name: 'main' } }), 'no-upstream');
  });

  it('reports a missing remote before a detached HEAD', () => {
    assert.strictEqual(skipReason({ ...base, hasRemote: false, branch: undefined }), 'no-remote');
  });
});

describe('decideAction', () => {
  it('does nothing when in sync', () => {
    assert.deepStrictEqual(decideAction(base, ctx), { type: 'none' });
  });

  it('treats missing counts as zero', () => {
    assert.deepStrictEqual(decideAction({ ...base, ahead: undefined, behind: undefined }, ctx), { type: 'none' });
  });

  it('pulls when only behind', () => {
    assert.deepStrictEqual(decideAction({ ...base, behind: 2 }, ctx), { type: 'pull' });
  });

  it('pushes when only ahead', () => {
    assert.deepStrictEqual(decideAction({ ...base, ahead: 2 }, ctx), { type: 'push' });
  });

  it('blocks when diverged', () => {
    assert.deepStrictEqual(decideAction({ ...base, ahead: 1, behind: 1 }, ctx), {
      type: 'blocked',
      reason: 'diverged',
    });
  });

  it('blocks a pull when merge.ff is disabled', () => {
    assert.deepStrictEqual(decideAction({ ...base, behind: 1 }, { ...ctx, mergeFfDisabled: true }), {
      type: 'blocked',
      reason: 'merge-ff-disabled',
    });
  });

  it('still pushes when merge.ff is disabled', () => {
    assert.deepStrictEqual(decideAction({ ...base, ahead: 1 }, { ...ctx, mergeFfDisabled: true }), { type: 'push' });
  });

  it('blocks a pull with autoStash and local changes', () => {
    assert.deepStrictEqual(decideAction({ ...base, behind: 1 }, { ...ctx, autoStash: true, dirty: true }), {
      type: 'blocked',
      reason: 'autostash-dirty',
    });
  });

  it('pulls with autoStash when the tree is clean', () => {
    assert.deepStrictEqual(decideAction({ ...base, behind: 1 }, { ...ctx, autoStash: true }), { type: 'pull' });
  });

  it('pulls with local changes when autoStash is off', () => {
    assert.deepStrictEqual(decideAction({ ...base, behind: 1 }, { ...ctx, dirty: true }), { type: 'pull' });
  });

  it('does not depend on the upstream branch having the same name', () => {
    const upstream = { remote: 'origin', name: 'other' };
    assert.deepStrictEqual(decideAction({ ...base, behind: 1, upstream }, ctx), { type: 'pull' });
    assert.deepStrictEqual(decideAction({ ...base, ahead: 1, upstream }, ctx), { type: 'push' });
  });
});

describe('classifyError', () => {
  it('maps auth errors', () => {
    assert.strictEqual(classifyError('AuthenticationFailed', 'fetch'), 'auth');
    assert.strictEqual(classifyError('PermissionDenied', 'push'), 'auth');
  });

  it('maps connection errors', () => {
    assert.strictEqual(classifyError('RemoteConnectionError', 'fetch'), 'network');
    assert.strictEqual(classifyError('CantAccessRemote', 'fetch'), 'network');
  });

  it('only reports rejections for pushes', () => {
    assert.strictEqual(classifyError('PushRejected', 'push'), 'push-rejected');
    assert.strictEqual(classifyError('PushRejected', 'pull'), 'error');
  });

  it('maps errors caused by local changes', () => {
    assert.strictEqual(classifyError('LocalChangesOverwritten', 'pull'), 'local-changes');
    assert.strictEqual(classifyError('DirtyWorkTree', 'pull'), 'local-changes');
  });

  it('spots auth failures in the git output, whatever the code', () => {
    const ssh = 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.';
    assert.strictEqual(classifyError('RemoteConnectionError', 'fetch', ssh), 'auth');
    assert.strictEqual(classifyError(undefined, 'fetch', 'fatal: could not read Username for https://x'), 'auth');
    assert.strictEqual(classifyError(undefined, 'push', 'The requested URL returned error: 403'), 'auth');
  });

  it('does not mistake file permission errors for auth failures', () => {
    assert.strictEqual(classifyError(undefined, 'fetch', 'error: cannot open .git/FETCH_HEAD: Permission denied'), 'error');
  });

  it('falls back to a generic error', () => {
    assert.strictEqual(classifyError(undefined, 'fetch'), 'error');
    assert.strictEqual(classifyError('Whatever', 'fetch'), 'error');
  });
});

import * as assert from 'node:assert';
import { describeSummary, shouldLog, summarizeRun, type SyncOutcome } from '../../src/outcome';

const upToDate: SyncOutcome = { status: 'up-to-date' };
const pulled: SyncOutcome = { status: 'pulled', commits: 1 };
const skipped: SyncOutcome = { status: 'skipped', reason: 'no-upstream' };
const diverged: SyncOutcome = {
  status: 'blocked',
  reason: 'diverged',
  issue: { kind: 'diverged', message: 'Diverged.' },
};
const failed: SyncOutcome = { status: 'failed', phase: 'fetch', issue: { kind: 'network', message: 'offline' } };

describe('summarizeRun', () => {
  it('counts each kind', () => {
    assert.deepStrictEqual(summarizeRun([upToDate, upToDate, pulled, skipped, diverged, failed]), {
      total: 6,
      pulled: 1,
      pushed: 0,
      upToDate: 2,
      skipped: 1,
      needAttention: 2,
    });
  });
});

describe('describeSummary', () => {
  it('reads naturally', () => {
    assert.strictEqual(
      describeSummary(summarizeRun([upToDate, upToDate, pulled, diverged])),
      'Checked 4 repositories: 1 pulled, 2 up to date, 1 needs attention.',
    );
    assert.strictEqual(describeSummary(summarizeRun([upToDate])), 'Checked 1 repository: 1 up to date.');
  });

  it('handles no repositories', () => {
    assert.strictEqual(describeSummary(summarizeRun([])), 'No repositories to sync.');
  });
});

describe('shouldLog', () => {
  it('logs everything for manual runs', () => {
    assert.strictEqual(shouldLog(upToDate, upToDate, true), true);
  });

  it('stays quiet for repeated unchanged results', () => {
    assert.strictEqual(shouldLog(upToDate, upToDate, false), false);
    assert.strictEqual(shouldLog(skipped, skipped, false), false);
    assert.strictEqual(shouldLog(diverged, diverged, false), false);
    assert.strictEqual(shouldLog(failed, failed, false), false);
  });

  it('logs the first result for a repo, except plain up to date', () => {
    assert.strictEqual(shouldLog(undefined, skipped, false), true);
    assert.strictEqual(shouldLog(undefined, diverged, false), true);
  });

  it('always logs pulls and pushes', () => {
    assert.strictEqual(shouldLog(pulled, pulled, false), true);
  });

  it('logs changes and recoveries', () => {
    assert.strictEqual(shouldLog(upToDate, diverged, false), true);
    assert.strictEqual(shouldLog(diverged, upToDate, false), true);
    assert.strictEqual(shouldLog(failed, upToDate, false), true);
    assert.strictEqual(shouldLog(skipped, { status: 'skipped', reason: 'detached' }, false), true);
  });
});

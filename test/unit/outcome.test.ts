import * as assert from 'node:assert';
import { describeOutcome, summarizeError } from '../../src/outcome';

describe('describeOutcome', () => {
  it('describes each outcome', () => {
    assert.strictEqual(describeOutcome({ status: 'up-to-date' }), 'up to date');
    assert.strictEqual(describeOutcome({ status: 'pulled', commits: 1 }), 'pulled 1 commit');
    assert.strictEqual(describeOutcome({ status: 'pushed', commits: 3 }), 'pushed 3 commits');
    assert.strictEqual(describeOutcome({ status: 'skipped', reason: 'detached' }), 'skipped: HEAD is detached');
    assert.strictEqual(
      describeOutcome({ status: 'blocked', reason: 'diverged', issue: { kind: 'diverged', message: 'Diverged.' } }),
      'needs attention: Diverged.',
    );
    assert.strictEqual(
      describeOutcome({ status: 'failed', phase: 'push', issue: { kind: 'push-rejected', message: 'rejected' } }),
      'push failed (push-rejected): rejected',
    );
  });
});

describe('summarizeError', () => {
  it('prefers fatal and error lines', () => {
    assert.strictEqual(summarizeError('hint: something\nfatal: bad thing\nmore'), 'fatal: bad thing');
  });

  it('falls back to the first line', () => {
    assert.strictEqual(summarizeError('\n  first  \nsecond'), 'first');
  });

  it('handles empty text', () => {
    assert.strictEqual(summarizeError(''), 'Unknown error');
  });

  it('truncates long lines', () => {
    assert.strictEqual(summarizeError('x'.repeat(500)).length, 300);
  });
});

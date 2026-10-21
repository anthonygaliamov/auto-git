import * as assert from 'node:assert';
import { readConfigFlags } from '../../src/gitConfig';

const entries = (...pairs: Array<[string, string]>) => pairs.map(([key, value]) => ({ key, value }));

describe('readConfigFlags', () => {
  it('has safe defaults', () => {
    assert.deepStrictEqual(readConfigFlags([]), { mergeFfDisabled: false, autoStash: false });
  });

  it('detects merge.ff=false in its spellings', () => {
    for (const value of ['false', 'FALSE', 'no', 'off', '0']) {
      assert.strictEqual(readConfigFlags(entries(['merge.ff', value])).mergeFfDisabled, true, value);
    }
  });

  it('does not block for merge.ff=only or true', () => {
    assert.strictEqual(readConfigFlags(entries(['merge.ff', 'only'])).mergeFfDisabled, false);
    assert.strictEqual(readConfigFlags(entries(['merge.ff', 'true'])).mergeFfDisabled, false);
  });

  it('lets pull.ff override merge.ff', () => {
    assert.strictEqual(readConfigFlags(entries(['merge.ff', 'false'], ['pull.ff', 'only'])).mergeFfDisabled, false);
    assert.strictEqual(readConfigFlags(entries(['merge.ff', 'only'], ['pull.ff', 'false'])).mergeFfDisabled, true);
  });

  it('uses the last value when a key is repeated', () => {
    assert.strictEqual(readConfigFlags(entries(['merge.ff', 'false'], ['merge.ff', 'true'])).mergeFfDisabled, false);
  });

  it('ignores key case', () => {
    assert.strictEqual(readConfigFlags(entries(['Merge.FF', 'false'])).mergeFfDisabled, true);
  });

  it('detects git-level autostash', () => {
    assert.strictEqual(readConfigFlags(entries(['merge.autostash', 'true'])).autoStash, true);
    assert.strictEqual(readConfigFlags(entries(['rebase.autostash', 'true'])).autoStash, true);
    assert.strictEqual(readConfigFlags(entries(['rebase.autostash', 'false'])).autoStash, false);
  });
});

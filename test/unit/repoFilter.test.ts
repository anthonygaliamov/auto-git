import * as assert from 'node:assert';
import * as path from 'node:path';
import { invalidEntries, isSelected } from '../../src/repoFilter';

const a = path.resolve('/work/a');
const b = path.resolve('/work/b');

describe('isSelected', () => {
  it('selects everything when both lists are empty', () => {
    assert.strictEqual(isSelected(a, { include: [], exclude: [] }), true);
  });

  it('only selects included repos when the include list is set', () => {
    const selection = { include: [a], exclude: [] };
    assert.strictEqual(isSelected(a, selection), true);
    assert.strictEqual(isSelected(b, selection), false);
  });

  it('never selects excluded repos', () => {
    assert.strictEqual(isSelected(a, { include: [], exclude: [a] }), false);
    assert.strictEqual(isSelected(b, { include: [], exclude: [a] }), true);
  });

  it('exclude wins over include', () => {
    assert.strictEqual(isSelected(a, { include: [a], exclude: [a] }), false);
  });

  it('ignores trailing separators', () => {
    assert.strictEqual(isSelected(a, { include: [a + path.sep], exclude: [] }), true);
  });

  it('selects nothing when the include list has only relative entries', () => {
    assert.strictEqual(isSelected(a, { include: ['a'], exclude: [] }), false);
  });
});

describe('invalidEntries', () => {
  it('returns relative entries only', () => {
    assert.deepStrictEqual(invalidEntries([a, 'repo', '~/repo']), ['repo', '~/repo']);
  });
});

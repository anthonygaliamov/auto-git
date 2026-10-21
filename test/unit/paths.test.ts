import * as assert from 'node:assert';
import * as path from 'node:path';
import { containingRoot } from '../../src/paths';

const a = path.resolve('/work/a');
const ab = path.resolve('/work/a/b');

describe('containingRoot', () => {
  it('finds the root that contains a file', () => {
    assert.strictEqual(containingRoot([a], path.join(a, 'src', 'x.ts')), a);
  });

  it('prefers the deepest root', () => {
    assert.strictEqual(containingRoot([a, ab], path.join(ab, 'x.ts')), ab);
    assert.strictEqual(containingRoot([ab, a], path.join(a, 'x.ts')), a);
  });

  it('does not match a sibling that shares a prefix', () => {
    assert.strictEqual(containingRoot([a], path.resolve('/work/a-other/x.ts')), undefined);
  });

  it('matches the root itself', () => {
    assert.strictEqual(containingRoot([a], a), a);
  });

  it('returns undefined when nothing matches', () => {
    assert.strictEqual(containingRoot([a], path.resolve('/elsewhere/x.ts')), undefined);
  });
});

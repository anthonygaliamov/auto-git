import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findRepos } from '../../src/scan';

describe('findRepos', () => {
  let root: string;

  function mkRepo(...parts: string[]): string {
    const dir = path.join(root, ...parts);
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    return dir;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-scan-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds the root when it is a repo', async () => {
    mkRepo();
    assert.deepStrictEqual(await findRepos(root, 0), [root]);
  });

  it('finds nested repos within the depth limit', async () => {
    const a = mkRepo('a');
    const c = mkRepo('b', 'c');
    assert.deepStrictEqual(await findRepos(root, 2), [a, c]);
  });

  it('stops at the depth limit', async () => {
    const a = mkRepo('a');
    mkRepo('b', 'c');
    assert.deepStrictEqual(await findRepos(root, 1), [a]);
    assert.deepStrictEqual(await findRepos(root, 0), []);
  });

  it('keeps looking inside a repo for nested repos', async () => {
    const outer = mkRepo('outer');
    const inner = mkRepo('outer', 'inner');
    assert.deepStrictEqual(await findRepos(root, 2), [outer, inner]);
  });

  it('treats a .git file as a repo (worktrees and submodules)', async () => {
    const dir = path.join(root, 'wt');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../elsewhere');
    assert.deepStrictEqual(await findRepos(root, 1), [dir]);
  });

  it('skips node_modules', async () => {
    mkRepo('node_modules', 'pkg');
    assert.deepStrictEqual(await findRepos(root, 3), []);
  });

  it('returns nothing for a missing folder', async () => {
    assert.deepStrictEqual(await findRepos(path.join(root, 'nope'), 3), []);
  });
});

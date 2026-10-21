import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectInProgress, resolveGitDir } from '../../src/inProgress';

describe('inProgress', () => {
  let root: string;
  let gitDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ip-'));
    gitDir = path.join(root, '.git');
    fs.mkdirSync(gitDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds nothing in a quiet repo', async () => {
    assert.strictEqual(await detectInProgress(root), undefined);
  });

  it('detects each operation', async () => {
    const cases: Array<[string, boolean, string]> = [
      ['MERGE_HEAD', false, 'merge'],
      ['CHERRY_PICK_HEAD', false, 'cherry-pick'],
      ['REVERT_HEAD', false, 'revert'],
      ['rebase-merge', true, 'rebase'],
      ['rebase-apply', true, 'rebase'],
    ];
    for (const [name, isDir, expected] of cases) {
      const target = path.join(gitDir, name);
      if (isDir) {
        fs.mkdirSync(target);
      } else {
        fs.writeFileSync(target, 'abc\n');
      }
      assert.strictEqual(await detectInProgress(root), expected, name);
      fs.rmSync(target, { recursive: true });
    }
  });

  it('follows a .git file to the real git dir', async () => {
    const wt = path.join(root, 'wt');
    const realDir = path.join(root, 'elsewhere');
    fs.mkdirSync(wt);
    fs.mkdirSync(realDir);
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join('..', 'elsewhere')}\n`);
    assert.strictEqual(await resolveGitDir(wt), realDir);
    assert.strictEqual(await detectInProgress(wt), undefined);
    fs.writeFileSync(path.join(realDir, 'MERGE_HEAD'), 'abc\n');
    assert.strictEqual(await detectInProgress(wt), 'merge');
  });

  it('returns undefined when there is no .git', async () => {
    assert.strictEqual(await resolveGitDir(path.join(root, 'missing')), undefined);
  });
});

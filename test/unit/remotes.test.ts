import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseRemotes, readRemotes } from '../../src/remotes';

const WITH_REMOTE = '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@example.com:a/b.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';
const WITHOUT_REMOTE = '[core]\n\tbare = false\n[branch "main"]\n\tmerge = refs/heads/main\n';

describe('parseRemotes', () => {
  it('finds remote names', () => {
    assert.deepStrictEqual(parseRemotes(WITH_REMOTE), ['origin']);
    assert.deepStrictEqual(parseRemotes(WITH_REMOTE + '[remote "backup"]\n\turl = x\n'), ['origin', 'backup']);
  });

  it('finds nothing when there are no remotes', () => {
    assert.deepStrictEqual(parseRemotes(WITHOUT_REMOTE), []);
    assert.deepStrictEqual(parseRemotes(''), []);
  });

  it('does not mistake other sections or values for remotes', () => {
    assert.deepStrictEqual(parseRemotes('[branch "main"]\n\tremote = origin\n[url "x"]\n\tinsteadOf = remote\n'), []);
  });

  it('copes with indentation and spacing', () => {
    assert.deepStrictEqual(parseRemotes('  [remote   "origin"]  \n'), ['origin']);
  });
});

describe('readRemotes', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-remotes-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function repo(name: string, config: string): string {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'config'), config);
    return dir;
  }

  it('reads the remotes of a normal repo', async () => {
    assert.deepStrictEqual(await readRemotes(repo('a', WITH_REMOTE)), ['origin']);
  });

  it('returns nothing for a repo with no remote', async () => {
    assert.deepStrictEqual(await readRemotes(repo('a', WITHOUT_REMOTE)), []);
  });

  it('returns nothing when there is no config or no .git', async () => {
    const dir = path.join(root, 'bare');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    assert.deepStrictEqual(await readRemotes(dir), []);
    assert.deepStrictEqual(await readRemotes(path.join(root, 'missing')), []);
  });

  it('follows a .git file to a submodule git dir', async () => {
    const modules = path.join(root, 'super', '.git', 'modules', 'theme');
    fs.mkdirSync(modules, { recursive: true });
    fs.writeFileSync(path.join(modules, 'config'), WITH_REMOTE);
    const sub = path.join(root, 'super', 'themes', 'theme');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, '.git'), `gitdir: ${path.relative(sub, modules)}\n`);
    assert.deepStrictEqual(await readRemotes(sub), ['origin']);
  });

  it('reads a worktree remote from the main repo through commondir', async () => {
    const main = repo('main', WITH_REMOTE);
    const wtGit = path.join(main, '.git', 'worktrees', 'wt');
    fs.mkdirSync(wtGit, { recursive: true });
    fs.writeFileSync(path.join(wtGit, 'commondir'), '../..\n');
    const wt = path.join(root, 'wt');
    fs.mkdirSync(wt);
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${wtGit}\n`);
    assert.deepStrictEqual(await readRemotes(wt), ['origin']);
  });
});

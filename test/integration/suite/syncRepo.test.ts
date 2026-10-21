import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API, Repository } from '../../../src/git';
import { getGitApi } from '../../../src/gitApi';
import { RepoSyncer } from '../../../src/syncRepo';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

describe('syncing a repository', () => {
  const syncer = new RepoSyncer({ info: () => undefined });
  let api: API;
  let root: string;
  let remote: string;
  let local: string;
  let other: string;

  async function open(dir: string): Promise<Repository> {
    const repository = await api.openRepository(vscode.Uri.file(dir));
    assert.ok(repository, `could not open ${dir}`);
    return repository;
  }

  function commit(dir: string, file: string, content: string, message = `change ${file}`): void {
    fs.writeFileSync(path.join(dir, file), content);
    git(dir, 'add', file);
    git(dir, 'commit', '--quiet', '-m', message);
  }

  const head = (dir: string): string => git(dir, 'rev-parse', 'HEAD');
  const remoteHead = (branch = 'main'): string => git(remote, 'rev-parse', `refs/heads/${branch}`);

  before(async () => {
    const found = await getGitApi();
    assert.ok(found, 'the Git extension is not available');
    api = found;
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-sync-'));
    remote = path.join(root, 'remote.git');
    local = path.join(root, 'local');
    other = path.join(root, 'other');
    git(root, 'init', '--quiet', '--bare', remote);
    git(root, 'clone', '--quiet', remote, local);
    commit(local, 'a.txt', 'one\n', 'initial');
    commit(local, 'b.txt', 'one\n', 'second');
    git(local, 'push', '--quiet', '-u', 'origin', 'main');
    git(root, 'clone', '--quiet', remote, other);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports up to date when nothing changed', async () => {
    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'up-to-date' });
  });

  it('pulls commits made elsewhere', async () => {
    commit(other, 'c.txt', 'new\n');
    commit(other, 'd.txt', 'new\n');
    git(other, 'push', '--quiet');

    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'pulled', commits: 2 });
    assert.strictEqual(head(local), remoteHead());
    assert.ok(fs.existsSync(path.join(local, 'd.txt')));
  });

  it('pushes local commits', async () => {
    commit(local, 'c.txt', 'mine\n');

    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'pushed', commits: 1 });
    assert.strictEqual(remoteHead(), head(local));
  });

  it('leaves diverged branches alone', async () => {
    commit(other, 'c.txt', 'theirs\n');
    git(other, 'push', '--quiet');
    commit(local, 'd.txt', 'mine\n');
    const before = { local: head(local), remote: remoteHead() };

    const outcome = await syncer.sync(await open(local));

    assert.strictEqual(outcome.status, 'blocked');
    assert.strictEqual(outcome.status === 'blocked' && outcome.issue.kind, 'diverged');
    assert.strictEqual(head(local), before.local);
    assert.strictEqual(remoteHead(), before.remote);
  });

  it('pulls with local changes that do not overlap', async () => {
    commit(other, 'c.txt', 'new\n');
    git(other, 'push', '--quiet');
    fs.writeFileSync(path.join(local, 'a.txt'), 'edited locally\n');

    assert.strictEqual((await syncer.sync(await open(local))).status, 'pulled');
    assert.strictEqual(fs.readFileSync(path.join(local, 'a.txt'), 'utf8'), 'edited locally\n');
    assert.ok(fs.existsSync(path.join(local, 'c.txt')));
  });

  it('refuses to overwrite overlapping local changes', async () => {
    commit(other, 'a.txt', 'theirs\n');
    git(other, 'push', '--quiet');
    fs.writeFileSync(path.join(local, 'a.txt'), 'edited locally\n');
    const before = head(local);

    const outcome = await syncer.sync(await open(local));

    assert.strictEqual(outcome.status, 'failed');
    assert.strictEqual(outcome.status === 'failed' && outcome.phase, 'pull');
    assert.strictEqual(outcome.status === 'failed' && outcome.issue.kind, 'local-changes');
    assert.strictEqual(head(local), before);
    assert.strictEqual(fs.readFileSync(path.join(local, 'a.txt'), 'utf8'), 'edited locally\n');
  });

  it('pushes even with uncommitted changes', async () => {
    commit(local, 'c.txt', 'mine\n');
    fs.writeFileSync(path.join(local, 'a.txt'), 'edited locally\n');

    assert.strictEqual((await syncer.sync(await open(local))).status, 'pushed');
    assert.strictEqual(remoteHead(), head(local));
  });

  it('skips a branch with no upstream and does not publish it', async () => {
    git(local, 'checkout', '--quiet', '-b', 'topic');
    commit(local, 'c.txt', 'mine\n');

    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'skipped', reason: 'no-upstream' });
    assert.strictEqual(git(remote, 'branch', '--list', 'topic'), '');
  });

  it('pushes to an upstream branch with a different name', async () => {
    git(local, 'checkout', '--quiet', '-b', 'topic');
    git(local, 'push', '--quiet', '-u', 'origin', 'topic:renamed');
    commit(local, 'c.txt', 'mine\n');

    assert.strictEqual((await syncer.sync(await open(local))).status, 'pushed');
    assert.strictEqual(remoteHead('renamed'), head(local));
    assert.strictEqual(git(remote, 'branch', '--list', 'topic'), '');
  });

  it('only touches the current branch', async () => {
    git(local, 'checkout', '--quiet', '-b', 'topic');
    git(local, 'push', '--quiet', '-u', 'origin', 'topic');
    commit(local, 'c.txt', 'on topic\n');
    git(local, 'checkout', '--quiet', 'main');
    const topicBefore = remoteHead('topic');

    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'up-to-date' });
    assert.strictEqual(remoteHead('topic'), topicBefore);
  });

  it('skips repos without a remote', async () => {
    const lonely = path.join(root, 'lonely');
    git(root, 'init', '--quiet', lonely);
    commit(lonely, 'a.txt', 'x\n');

    assert.deepStrictEqual(await syncer.sync(await open(lonely)), { status: 'skipped', reason: 'no-remote' });
  });

  it('skips a detached HEAD', async () => {
    git(local, 'checkout', '--quiet', '--detach');

    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'skipped', reason: 'detached' });
  });

  it('skips while a cherry-pick is in progress', async () => {
    fs.writeFileSync(path.join(local, '.git', 'CHERRY_PICK_HEAD'), `${head(local)}\n`);
    commit(other, 'c.txt', 'new\n');
    git(other, 'push', '--quiet');
    const before = head(local);

    assert.deepStrictEqual(await syncer.sync(await open(local)), { status: 'skipped', reason: 'in-progress' });
    assert.strictEqual(head(local), before);
  });

  it('does not pull when merge.ff is false', async () => {
    git(local, 'config', 'merge.ff', 'false');
    commit(other, 'c.txt', 'new\n');
    git(other, 'push', '--quiet');
    const before = head(local);

    const outcome = await syncer.sync(await open(local));

    assert.strictEqual(outcome.status, 'blocked');
    assert.strictEqual(outcome.status === 'blocked' && outcome.reason, 'merge-ff-disabled');
    assert.strictEqual(head(local), before);
  });

  it('reports an unreachable remote as a failed fetch', async () => {
    git(local, 'remote', 'set-url', 'origin', path.join(root, 'does-not-exist.git'));

    const outcome = await syncer.sync(await open(local));

    assert.strictEqual(outcome.status, 'failed');
    assert.strictEqual(outcome.status === 'failed' && outcome.phase, 'fetch');
    assert.strictEqual(outcome.status === 'failed' && outcome.issue.kind, 'network');
  });

  it('reports a rejected push', async () => {
    fs.writeFileSync(path.join(remote, 'hooks', 'pre-receive'), '#!/bin/sh\necho "no pushes today" >&2\nexit 1\n', {
      mode: 0o755,
    });
    commit(local, 'c.txt', 'mine\n');

    const outcome = await syncer.sync(await open(local));

    assert.strictEqual(outcome.status, 'failed');
    assert.strictEqual(outcome.status === 'failed' && outcome.phase, 'push');
  });

  it('runs one sync per repository at a time', async () => {
    const repository = await open(local);
    const [first, second] = await Promise.all([syncer.sync(repository), syncer.sync(repository)]);

    assert.deepStrictEqual([first.status, second.status].sort(), ['skipped', 'up-to-date']);
  });
});

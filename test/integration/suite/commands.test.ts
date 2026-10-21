import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../../../src/commands';
import type { AutoGitExports } from '../../../src/extension';
import type { RunSummary } from '../../../src/outcome';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

describe('commands', () => {
  let services: Services;
  let root: string;
  let remote: string;
  let local: string;
  let other: string;

  const setting = (key: string, value: unknown) =>
    vscode.workspace.getConfiguration('autoGit').update(key, value, vscode.ConfigurationTarget.Workspace);

  before(async () => {
    const ext = vscode.extensions.getExtension<AutoGitExports>('anthonygaliamov.auto-git');
    assert.ok(ext);
    const found = await (await ext.activate()).ready;
    assert.ok(found, 'services did not start');
    services = found;
  });

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cmd-'));
    remote = path.join(root, 'remote.git');
    local = path.join(root, 'local');
    other = path.join(root, 'other');
    git(root, 'init', '--quiet', '--bare', remote);
    git(root, 'clone', '--quiet', remote, local);
    fs.writeFileSync(path.join(local, 'a.txt'), 'one\n');
    git(local, 'add', 'a.txt');
    git(local, 'commit', '--quiet', '-m', 'initial');
    git(local, 'push', '--quiet', '-u', 'origin', 'main');
    git(root, 'clone', '--quiet', remote, other);

    // Track only this repo, so the test cannot touch the fixture repos.
    await setting('includeRepos', [local]);
    await setting('scanDepth', 0);
    await services.discovery.refresh();
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('autoGit.resume');
    await setting('includeRepos', undefined);
    await setting('scanDepth', undefined);
    await services.discovery.refresh();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function pushFromOther(file: string): void {
    fs.writeFileSync(path.join(other, file), 'new\n');
    git(other, 'add', file);
    git(other, 'commit', '--quiet', '-m', `add ${file}`);
    git(other, 'push', '--quiet');
  }

  it('registers every command', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['syncAll', 'syncRepository', 'pause', 'resume', 'showLog']) {
      assert.ok(commands.includes(`autoGit.${id}`), id);
    }
  });

  it('syncAll tracks only the configured repo and pulls', async () => {
    pushFromOther('b.txt');

    const summary = await vscode.commands.executeCommand<RunSummary>('autoGit.syncAll');

    assert.strictEqual(summary.total, 1);
    assert.strictEqual(summary.pulled, 1);
    assert.ok(fs.existsSync(path.join(local, 'b.txt')));
  });

  it('syncAll pushes local commits', async () => {
    fs.writeFileSync(path.join(local, 'c.txt'), 'mine\n');
    git(local, 'add', 'c.txt');
    git(local, 'commit', '--quiet', '-m', 'add c');

    const summary = await vscode.commands.executeCommand<RunSummary>('autoGit.syncAll');

    assert.strictEqual(summary.pushed, 1);
    assert.strictEqual(git(remote, 'rev-parse', 'refs/heads/main'), git(local, 'rev-parse', 'HEAD'));
  });

  it('remembers the latest outcome per repo', async () => {
    await vscode.commands.executeCommand('autoGit.syncAll');

    const outcome = [...services.service.results.entries()].find(([p]) => fs.realpathSync(p) === fs.realpathSync(local));
    assert.deepStrictEqual(outcome?.[1], { status: 'up-to-date' });
    assert.strictEqual(services.service.syncing, false);
  });

  it('syncRepository syncs the repo it is given', async () => {
    pushFromOther('d.txt');
    const repository = services.discovery.getRepositories()[0];

    const outcome = await vscode.commands.executeCommand<{ status: string }>('autoGit.syncRepository', repository);

    assert.strictEqual(outcome.status, 'pulled');
  });

  it('syncAll still works while paused, and resume clears the pause', async () => {
    await vscode.commands.executeCommand('autoGit.pause');
    assert.strictEqual(services.scheduler.paused, true);
    pushFromOther('e.txt');

    const summary = await vscode.commands.executeCommand<RunSummary>('autoGit.syncAll');

    assert.strictEqual(summary.pulled, 1);
    assert.strictEqual(services.scheduler.paused, true);

    await vscode.commands.executeCommand('autoGit.resume');
    assert.strictEqual(services.scheduler.paused, false);
  });

  it('shares one run between overlapping syncAll calls', async () => {
    const [a, b] = await Promise.all([
      vscode.commands.executeCommand<RunSummary>('autoGit.syncAll'),
      vscode.commands.executeCommand<RunSummary>('autoGit.syncAll'),
    ]);
    assert.deepStrictEqual(a, b);
  });

  it('skips repos opted out with autoGit.enabled', async () => {
    // Per-repo opt-out is read from the workspace folder containing the repo, here the whole fixture folder.
    const config = vscode.workspace.getConfiguration('autoGit', vscode.Uri.file(local));
    await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
    try {
      await services.discovery.refresh();
      const summary = await vscode.commands.executeCommand<RunSummary>('autoGit.syncAll');
      assert.strictEqual(summary.total, 0);
    } finally {
      await config.update('enabled', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });
});

import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Services } from '../../../src/commands';
import type { AutoGitExports } from '../../../src/extension';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

describe('status bar and notifications', () => {
  let services: Services;
  let root: string;
  let remote: string;
  let local: string;
  let other: string;
  let warnings: string[];
  const realWarning = vscode.window.showWarningMessage;

  const setting = (key: string, value: unknown) =>
    vscode.workspace.getConfiguration('autoGit').update(key, value, vscode.ConfigurationTarget.Workspace);

  function commit(dir: string, file: string): void {
    fs.writeFileSync(path.join(dir, file), `${file}\n`);
    git(dir, 'add', file);
    git(dir, 'commit', '--quiet', '-m', `add ${file}`);
  }

  function diverge(): void {
    commit(other, 'theirs.txt');
    git(other, 'push', '--quiet');
    commit(local, 'mine.txt');
  }

  function heal(): void {
    git(local, 'reset', '--quiet', '--hard', 'origin/main');
  }

  before(async () => {
    const ext = vscode.extensions.getExtension<AutoGitExports>('anthonygaliamov.auto-sync');
    assert.ok(ext);
    const found = await (await ext.activate()).ready;
    assert.ok(found, 'services did not start');
    services = found;
  });

  beforeEach(async () => {
    warnings = [];
    // Resolve to undefined, as if the user dismissed the notification.
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (message: string) => {
      warnings.push(message);
      return Promise.resolve(undefined);
    };

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-status-'));
    remote = path.join(root, 'remote.git');
    local = path.join(root, 'local');
    other = path.join(root, 'other');
    git(root, 'init', '--quiet', '--bare', remote);
    git(root, 'clone', '--quiet', remote, local);
    commit(local, 'a.txt');
    git(local, 'push', '--quiet', '-u', 'origin', 'main');
    git(root, 'clone', '--quiet', remote, other);

    await setting('includeRepos', [local]);
    await setting('scanDepth', 0);
    await services.discovery.refresh();
  });

  afterEach(async () => {
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = realWarning;
    await vscode.commands.executeCommand('autoGit.resume');
    await setting('includeRepos', undefined);
    await setting('scanDepth', undefined);
    await setting('notifications', undefined);
    await services.discovery.refresh();
    await services.service.syncAll(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('is idle when everything is in sync', async () => {
    await vscode.commands.executeCommand('autoGit.syncAll');

    assert.strictEqual(services.status.text, '$(sync) Auto Git');
    assert.deepStrictEqual(services.status.issues, []);
    assert.deepStrictEqual(warnings, []);
  });

  it('shows a warning count for a diverged repo, and tells the user once', async () => {
    diverge();

    await vscode.commands.executeCommand('autoGit.syncAll');
    assert.strictEqual(services.status.text, '$(warning) Auto Git 1');
    assert.strictEqual(services.status.issues[0].kind, 'diverged');
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('local'), warnings[0]);

    await vscode.commands.executeCommand('autoGit.syncAll');
    await vscode.commands.executeCommand('autoGit.syncAll');
    assert.strictEqual(warnings.length, 1, 'the same problem must not be reported again');
  });

  it('clears the warning once fixed, and reports again if it comes back', async () => {
    diverge();
    await vscode.commands.executeCommand('autoGit.syncAll');
    assert.strictEqual(warnings.length, 1);

    heal();
    await vscode.commands.executeCommand('autoGit.syncAll');
    assert.strictEqual(services.status.text, '$(sync) Auto Git');

    commit(other, 'again.txt');
    git(other, 'push', '--quiet');
    commit(local, 'mine2.txt');
    await vscode.commands.executeCommand('autoGit.syncAll');
    assert.strictEqual(warnings.length, 2);
  });

  it('keeps the status bar warning but sends no notification when notifications are off', async () => {
    await setting('notifications', false);
    diverge();

    await vscode.commands.executeCommand('autoGit.syncAll');

    assert.strictEqual(services.status.text, '$(warning) Auto Git 1');
    assert.deepStrictEqual(warnings, []);
  });

  it('does not notify for problems that are not worth a pop-up', async () => {
    git(local, 'remote', 'set-url', 'origin', path.join(root, 'gone.git'));

    await vscode.commands.executeCommand('autoGit.syncAll');

    assert.strictEqual(services.status.text, '$(warning) Auto Git 1');
    assert.strictEqual(services.status.issues[0].kind, 'network');
    assert.deepStrictEqual(warnings, []);
  });

  it('shows a paused icon, and goes back to idle on resume', async () => {
    await vscode.commands.executeCommand('autoGit.syncAll');
    await vscode.commands.executeCommand('autoGit.pause');
    assert.strictEqual(services.status.text, '$(debug-pause) Auto Git');

    await vscode.commands.executeCommand('autoGit.resume');
    assert.notStrictEqual(services.status.text, '$(debug-pause) Auto Git');
  });

  it('Show Issues says so when there is nothing to show', async () => {
    await vscode.commands.executeCommand('autoGit.syncAll');
    await vscode.commands.executeCommand('autoGit.showIssues');
  });

  it('registers Show Issues', async () => {
    assert.ok((await vscode.commands.getCommands(true)).includes('autoGit.showIssues'));
  });
});

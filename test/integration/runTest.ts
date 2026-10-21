import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/** Workspace with repos at depth 0 (`a`), 1 (`nested/b`) and 4 (`nested/x/y/z/deep`). */
function createFixture(root: string): void {
  for (const rel of ['a', 'nested/b', 'nested/x/y/z/deep']) {
    const dir = path.join(root, rel);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
  }
}

async function main(): Promise<void> {
  // Set when launched from inside an Electron app, and stops VS Code starting.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  // Keep these short: macOS limits unix socket paths to about 100 characters.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agf-'));
  createFixture(fixtureDir);
  // Isolate git from the machine's own settings (pull.rebase, merge.ff and so on).
  const gitConfig = path.join(userDataDir, 'gitconfig');
  fs.writeFileSync(
    gitConfig,
    '[init]\n\tdefaultBranch = main\n[user]\n\tname = Auto Git Test\n\temail = test@example.com\n',
  );
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        AUTO_GIT_FIXTURE: fixtureDir,
        GIT_CONFIG_GLOBAL: gitConfig,
        GIT_CONFIG_NOSYSTEM: '1',
      },
      launchArgs: [fixtureDir, `--user-data-dir=${userDataDir}`],
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

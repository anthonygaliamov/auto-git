import * as vscode from 'vscode';
import type { RepoDiscovery } from './discovery';
import type { Repository } from './git';
import type { Logger } from './log';
import { containingRoot } from './paths';
import { describeOutcome, describeSummary, type RunSummary } from './outcome';
import type { Scheduler } from './scheduler';
import type { SyncService } from './syncService';

export interface Services {
  discovery: RepoDiscovery;
  service: SyncService;
  scheduler: Scheduler;
}

export const COMMANDS = {
  syncAll: 'autoGit.syncAll',
  syncRepository: 'autoGit.syncRepository',
  pause: 'autoGit.pause',
  resume: 'autoGit.resume',
  showLog: 'autoGit.showLog',
} as const;

/**
 * Registers the commands straight away so they exist before the Git extension is ready.
 * Each one waits for `ready`, and tells the user if the services never started.
 */
export function registerCommands(
  ready: Promise<Services | undefined>,
  log: Logger,
  onPausedChange: (paused: boolean) => void,
): vscode.Disposable {
  async function services(): Promise<Services | undefined> {
    const s = await ready.catch(() => undefined);
    if (!s) {
      void vscode.window.showWarningMessage('Auto Git is not running. The built-in Git extension is unavailable.');
    }
    return s;
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand(COMMANDS.syncAll, async (): Promise<RunSummary | undefined> => {
      const s = await services();
      if (!s) {
        return undefined;
      }
      const summary = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Auto Git: syncing' },
        () => s.service.syncAll(true),
      );
      void vscode.window.setStatusBarMessage(`Auto Git: ${describeSummary(summary)}`, 5000);
      return summary;
    }),

    vscode.commands.registerCommand(COMMANDS.syncRepository, async (target?: unknown) => {
      const s = await services();
      if (!s) {
        return undefined;
      }
      const repository = await pickRepository(s.discovery, target);
      if (!repository) {
        return undefined;
      }
      const outcome = await s.service.syncOne(repository);
      void vscode.window.setStatusBarMessage(
        `Auto Git: ${repository.rootUri.fsPath}: ${describeOutcome(outcome)}`,
        5000,
      );
      return outcome;
    }),

    vscode.commands.registerCommand(COMMANDS.pause, async () => {
      const s = await services();
      if (s) {
        s.scheduler.pause();
        log.info('Paused. Automatic syncing is off until resumed.');
        onPausedChange(true);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.resume, async () => {
      const s = await services();
      if (s) {
        s.scheduler.resume();
        log.info('Resumed.');
        onPausedChange(false);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.showLog, () => log.show()),
  );
}

/** Uses the repo passed in by a menu, then the active file's repo, then the only repo, then asks. */
async function pickRepository(discovery: RepoDiscovery, target: unknown): Promise<Repository | undefined> {
  const repositories = discovery.getRepositories();
  if (repositories.length === 0) {
    void vscode.window.showInformationMessage('Auto Git: no repositories are being tracked.');
    return undefined;
  }

  const fromTarget = (target as { rootUri?: vscode.Uri } | undefined)?.rootUri;
  const candidates = [fromTarget?.fsPath, vscode.window.activeTextEditor?.document.uri.fsPath].filter(
    (p): p is string => !!p,
  );
  for (const candidate of candidates) {
    const root = containingRoot(
      repositories.map((r) => r.rootUri.fsPath),
      candidate,
    );
    const match = repositories.find((r) => r.rootUri.fsPath === root);
    if (match) {
      return match;
    }
  }
  if (repositories.length === 1) {
    return repositories[0];
  }

  const picked = await vscode.window.showQuickPick(
    repositories.map((r) => ({ label: r.rootUri.fsPath, repository: r })),
    { placeHolder: 'Repository to sync' },
  );
  return picked?.repository;
}

import * as vscode from 'vscode';
import { registerCommands, type Services } from './commands';
import { RepoDiscovery } from './discovery';
import { getGitApi } from './gitApi';
import { Logger } from './log';
import { Scheduler } from './scheduler';
import { readSettings } from './settings';
import { StatusController } from './statusBar';
import { SyncService } from './syncService';
import { RepoSyncer } from './syncRepo';

/** Exposed so integration tests can inspect state. Not a public API. */
export interface AutoSyncExports {
  /** Resolves once the first repository scan has finished. */
  ready: Promise<Services | undefined>;
}

const STARTUP_DELAY_MS = 5000;

export function activate(context: vscode.ExtensionContext): AutoSyncExports {
  const log = new Logger();
  context.subscriptions.push(log);

  const ready = start(context, log);
  ready.catch((err) => log.info(`Startup failed: ${err instanceof Error ? err.message : String(err)}`));

  context.subscriptions.push(
    registerCommands(ready, log, (paused) => void vscode.commands.executeCommand('setContext', 'autoSync.paused', paused)),
  );
  void vscode.commands.executeCommand('setContext', 'autoSync.paused', false);

  return { ready };
}

async function start(context: vscode.ExtensionContext, log: Logger): Promise<Services | undefined> {
  const api = await getGitApi();
  if (!api) {
    log.info('The built-in Git extension is not available.');
    return undefined;
  }

  const discovery = new RepoDiscovery(api, log);
  const service = new SyncService(discovery, new RepoSyncer(log), log);
  const scheduler = new Scheduler({
    run: async () => void (await service.syncAll(false)),
    intervalMs: () => readSettings().intervalMinutes * 60_000,
    onError: (err) => log.info(`Sync failed: ${err instanceof Error ? err.message : String(err)}`),
  });
  const status = new StatusController(discovery, service, scheduler);
  context.subscriptions.push(
    discovery,
    service,
    scheduler,
    status,
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused && readSettings().syncOnFocus) {
        scheduler.focus();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('autoSync.intervalMinutes')) {
        scheduler.reschedule();
      }
    }),
  );

  await discovery.refresh();
  const { syncOnStartup, intervalMinutes } = readSettings();
  scheduler.start(syncOnStartup ? STARTUP_DELAY_MS : intervalMinutes * 60_000);
  log.info(`Auto Sync started. Syncing every ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}.`);

  return { discovery, service, scheduler, status };
}

export function deactivate(): void {}

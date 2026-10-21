import * as vscode from 'vscode';
import { RepoDiscovery } from './discovery';
import { getGitApi } from './gitApi';
import { Logger } from './log';

/** Exposed so integration tests can inspect state. Not a public API. */
export interface AutoGitExports {
  /** Resolves once the first repository scan has finished. */
  ready: Promise<RepoDiscovery | undefined>;
}

export function activate(context: vscode.ExtensionContext): AutoGitExports {
  const log = new Logger();
  context.subscriptions.push(log);

  const ready = (async () => {
    const api = await getGitApi();
    if (!api) {
      log.info('The built-in Git extension is not available.');
      return undefined;
    }
    const discovery = new RepoDiscovery(api, log);
    context.subscriptions.push(discovery);
    await discovery.refresh();
    return discovery;
  })();
  ready.catch((err) => log.info(`Startup failed: ${err instanceof Error ? err.message : String(err)}`));

  return { ready };
}

export function deactivate(): void {}

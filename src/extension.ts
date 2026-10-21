import * as vscode from 'vscode';
import type { GitExtension } from './git';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel('Auto Git');
  context.subscriptions.push(log);

  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!gitExtension) {
    log.appendLine('The built-in Git extension is not available.');
    return;
  }
  const git = (await gitExtension.activate()).getAPI(1);
  log.appendLine(`Auto Git activated. ${git.repositories.length} repositories open.`);
}

export function deactivate(): void {}

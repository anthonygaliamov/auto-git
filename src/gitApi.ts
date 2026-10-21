import * as vscode from 'vscode';
import type { API, GitExtension } from './git';

/**
 * Resolves the built-in Git API once the Git extension is enabled and has finished its
 * initial repository scan. Never resolves if the Git extension stays disabled.
 */
export async function getGitApi(): Promise<API | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    return undefined;
  }
  const git = await extension.activate();

  if (!git.enabled) {
    await new Promise<void>((resolve) => {
      const sub = git.onDidChangeEnablement((enabled) => {
        if (enabled) {
          sub.dispose();
          resolve();
        }
      });
    });
  }

  const api = git.getAPI(1);
  if (api.state !== 'initialized') {
    await new Promise<void>((resolve) => {
      const sub = api.onDidChangeState((state) => {
        if (state === 'initialized') {
          sub.dispose();
          resolve();
        }
      });
    });
  }
  return api;
}

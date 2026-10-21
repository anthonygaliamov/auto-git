import * as vscode from 'vscode';
import type { RepoSelection } from './repoFilter';

export interface Settings extends RepoSelection {
  scanDepth: number;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('autoGit');
  const depth = config.get<number>('scanDepth', 3);
  return {
    scanDepth: Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 3,
    include: config.get<string[]>('includeRepos', []),
    exclude: config.get<string[]>('excludeRepos', []),
  };
}

/** Per-repo opt-out, read through the workspace folder that contains the repo. */
export function isEnabledFor(repoPath: string): boolean {
  return vscode.workspace.getConfiguration('autoGit', vscode.Uri.file(repoPath)).get<boolean>('enabled', true);
}

import * as vscode from 'vscode';
import type { RepoSelection } from './repoFilter';

export interface Settings extends RepoSelection {
  scanDepth: number;
  intervalMinutes: number;
  syncOnStartup: boolean;
  syncOnFocus: boolean;
  notifications: boolean;
}

const MAX_INTERVAL_MINUTES = 7 * 24 * 60;

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('autoGit');
  return {
    scanDepth: Math.floor(clamp(config.get<number>('scanDepth', 3), 0, 20, 3)),
    include: config.get<string[]>('includeRepos', []),
    exclude: config.get<string[]>('excludeRepos', []),
    intervalMinutes: clamp(config.get<number>('intervalMinutes', 5), 1, MAX_INTERVAL_MINUTES, 5),
    syncOnStartup: config.get<boolean>('syncOnStartup', true),
    syncOnFocus: config.get<boolean>('syncOnFocus', true),
    notifications: config.get<boolean>('notifications', true),
  };
}

/** Per-repo opt-out, read through the workspace folder that contains the repo. */
export function isEnabledFor(repoPath: string): boolean {
  return vscode.workspace.getConfiguration('autoGit', vscode.Uri.file(repoPath)).get<boolean>('enabled', true);
}

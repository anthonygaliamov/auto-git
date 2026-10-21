import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { resolveGitDir } from './inProgress';

const REMOTE_SECTION = /^\s*\[remote\s+"([^"]+)"\s*\]/gim;

/** Remote names defined in the text of a git config file. */
export function parseRemotes(configText: string): string[] {
  return [...configText.matchAll(REMOTE_SECTION)].map((m) => m[1]);
}

/**
 * Remote names configured for a repository, read from its config file so the repo
 * does not have to be opened first. Worktrees keep their config in the main repo,
 * which their git dir points to through `commondir`.
 */
export async function readRemotes(repoRoot: string): Promise<string[]> {
  const gitDir = await resolveGitDir(repoRoot);
  if (!gitDir) {
    return [];
  }
  let configDir = gitDir;
  try {
    const common = (await fs.readFile(path.join(gitDir, 'commondir'), 'utf8')).trim();
    if (common) {
      configDir = path.resolve(gitDir, common);
    }
  } catch {
    // Not a worktree.
  }
  try {
    return parseRemotes(await fs.readFile(path.join(configDir, 'config'), 'utf8'));
  } catch {
    return [];
  }
}

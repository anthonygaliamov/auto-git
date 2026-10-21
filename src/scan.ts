import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.cache']);

/**
 * Finds git repositories at or below `root`, up to `maxDepth` folder levels.
 * Depth 0 checks only `root`. Symlinked folders are not followed.
 * A repo is any folder containing `.git` (a folder, or a file for worktrees and submodules).
 */
export async function findRepos(root: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === '.git')) {
      found.push(dir);
    }
    if (depth >= maxDepth) {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIPPED_FOLDERS.has(entry.name)) {
        await walk(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  await walk(root, 0);
  return found.sort();
}

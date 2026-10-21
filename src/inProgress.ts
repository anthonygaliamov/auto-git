import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { InProgressOperation } from './decide';

/** Finds the git directory. It is `.git/` normally, or the target of a `.git` file for worktrees and submodules. */
export async function resolveGitDir(repoRoot: string): Promise<string | undefined> {
  const dotGit = path.join(repoRoot, '.git');
  let stat;
  try {
    stat = await fs.stat(dotGit);
  } catch {
    return undefined;
  }
  if (stat.isDirectory()) {
    return dotGit;
  }
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(await fs.readFile(dotGit, 'utf8'));
  return match ? path.resolve(repoRoot, match[1]) : undefined;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const MARKERS: ReadonlyArray<[string, InProgressOperation]> = [
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
];

/** The Git extension API exposes rebase and merge conflicts but not cherry-pick or revert, so look at the git dir. */
export async function detectInProgress(repoRoot: string): Promise<InProgressOperation | undefined> {
  const gitDir = await resolveGitDir(repoRoot);
  if (!gitDir) {
    return undefined;
  }
  for (const [marker, operation] of MARKERS) {
    if (await exists(path.join(gitDir, marker))) {
      return operation;
    }
  }
  return undefined;
}

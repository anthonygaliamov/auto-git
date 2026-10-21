import * as path from 'node:path';
import { normalizePath } from './paths';

export interface RepoSelection {
  /** If not empty, only these repos are selected. */
  include: readonly string[];
  /** Never selected. Wins over include. */
  exclude: readonly string[];
}

function toSet(entries: readonly string[]): Set<string> {
  // Relative entries are ignored: they have no meaningful base folder.
  return new Set(entries.filter((e) => path.isAbsolute(e)).map(normalizePath));
}

/** Entries that are not absolute paths, and are therefore ignored. */
export function invalidEntries(entries: readonly string[]): string[] {
  return entries.filter((e) => !path.isAbsolute(e));
}

export function isSelected(repoPath: string, selection: RepoSelection): boolean {
  const key = normalizePath(repoPath);
  if (toSet(selection.exclude).has(key)) {
    return false;
  }
  // A non-empty include list with only invalid entries selects nothing, rather than everything.
  if (selection.include.length > 0) {
    return toSet(selection.include).has(key);
  }
  return true;
}

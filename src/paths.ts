import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Absolute, separator-normalised path. Case-insensitive on Windows. */
export function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Like normalizePath, but resolves symlinks first so two spellings of one folder compare equal. */
export async function realKey(p: string): Promise<string> {
  try {
    return normalizePath(await fs.realpath(p));
  } catch {
    return normalizePath(p);
  }
}

/** The longest entry of `roots` that contains `file`, or undefined. */
export function containingRoot(roots: readonly string[], file: string): string | undefined {
  const target = normalizePath(file);
  let best: { root: string; length: number } | undefined;
  for (const root of roots) {
    const key = normalizePath(root);
    const prefix = key.endsWith(path.sep) ? key : key + path.sep;
    if ((target === key || target.startsWith(prefix)) && (!best || key.length > best.length)) {
      best = { root, length: key.length };
    }
  }
  return best?.root;
}

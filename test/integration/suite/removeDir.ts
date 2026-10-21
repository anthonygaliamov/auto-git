import * as fs from 'node:fs/promises';

/**
 * Deletes a temp directory. On Windows, VS Code's Git extension may still hold watchers on the
 * repo for a moment, which makes the delete fail with EPERM or EBUSY, so retry and then give up
 * quietly. A leftover directory in the OS temp folder is harmless.
 */
export async function removeDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (err) {
    if (process.platform !== 'win32') {
      throw err;
    }
  }
}

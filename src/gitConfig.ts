export interface ConfigEntry {
  key: string;
  value: string;
}

export interface ConfigFlags {
  /** A fast-forward `git pull` would still create a merge commit. */
  mergeFfDisabled: boolean;
  /** Git itself stashes and re-applies local changes around a merge or rebase. */
  autoStash: boolean;
}

const FALSE = /^(false|no|off|0)$/i;
const TRUE = /^(true|yes|on|1)$/i;

/** Last value wins, matching how `git config -l` lists entries from lowest to highest priority. */
function lastValue(entries: readonly ConfigEntry[], key: string): string | undefined {
  let value: string | undefined;
  for (const entry of entries) {
    if (entry.key.toLowerCase() === key) {
      value = entry.value;
    }
  }
  return value;
}

/** Reads the settings that change what `git pull` does. `pull.ff` overrides `merge.ff` when pulling. */
export function readConfigFlags(entries: readonly ConfigEntry[]): ConfigFlags {
  const ff = lastValue(entries, 'pull.ff') ?? lastValue(entries, 'merge.ff') ?? '';
  return {
    mergeFfDisabled: FALSE.test(ff),
    autoStash: TRUE.test(lastValue(entries, 'merge.autostash') ?? '') || TRUE.test(lastValue(entries, 'rebase.autostash') ?? ''),
  };
}

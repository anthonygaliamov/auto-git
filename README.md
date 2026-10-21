# auto-sync

A VS Code extension that periodically syncs your local git repositories with their remotes. It fetches, fast-forward pulls, and pushes work you have already committed. It never commits, merges, rebases, force-pushes, or resolves conflicts. Anything it can't do safely is reported and left for you.

## What it does

Every 5 minutes (configurable), for each repo found in your open workspace folders:

1. Fetches the current branch from its upstream.
2. If the branch is behind, pulls it (fast-forward only).
3. If the branch is ahead, pushes it. No force push, and no new upstream branches.
4. If the branch has diverged, does nothing and notifies you.

Only repos that have a remote are tracked. A folder with a `.git` but no remote is ignored completely and is never opened in Source Control.

Repos are also skipped when they have a detached HEAD, a branch with no upstream, or a merge, rebase, cherry-pick or revert in progress. Uncommitted changes don't stop a sync, but git will still refuse a pull that would overwrite them.

Pulls are done by fast-forwarding to the branch that was just fetched, and only when the branch is strictly behind.

## Commands

| Command | What it does |
| --- | --- |
| `Auto Git: Sync All Repositories Now` | Syncs every tracked repo immediately, even while paused |
| `Auto Git: Sync This Repository` | Syncs the repo of the active file, or asks which one |
| `Auto Git: Pause` | Stops automatic syncing |
| `Auto Git: Resume` | Starts it again and syncs straight away |
| `Auto Git: Show Issues` | Lists repos that need attention |
| `Auto Git: Show Log` | Opens the output channel |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autoGit.enabled` | `true` | Turn syncing on or off. Can be set per repo folder |
| `autoGit.intervalMinutes` | `5` | Minutes between syncs |
| `autoGit.scanDepth` | `3` | How deep to look for nested repos in workspace folders |
| `autoGit.includeRepos` | `[]` | If not empty, only these repo paths are synced |
| `autoGit.excludeRepos` | `[]` | Repo paths that are never synced |
| `autoGit.syncOnStartup` | `true` | Sync shortly after VS Code starts |
| `autoGit.syncOnFocus` | `true` | Sync when the window regains focus |
| `autoGit.notifications` | `true` | Show notifications for problems |

## Status bar and notifications

The status bar item shows the current state:

| Icon | Meaning |
| --- | --- |
| `$(sync)` | Idle |
| `$(sync~spin)` | Syncing |
| `$(warning) N` | N repos need attention. Click to list them, and pick one to open a terminal in it |
| `$(debug-pause)` | Paused |

Hover for details, including repos on a local-only branch (nothing is pushed for those). The item is hidden when no repos are tracked. The `Auto Git` output channel logs every pull, push and change.

Notifications only appear for things you need to act on: diverged branches, rejected pushes, authentication failures, and `merge.ff=false`. Each problem is reported once, and again only if it clears and comes back. Other problems, such as being offline, only show in the status bar.

## Authentication

Auto-sync relies on credentials you have already set up (SSH keys or a git credential helper). It does not manage credentials.

## Notes

Auto Git only controls which repos it syncs. VS Code's own Git extension decides separately which repos appear in Source Control, through `git.autoRepositoryDetection` and `git.openRepositoryInParentFolders`. If a parent folder's repo shows up there, set `git.openRepositoryInParentFolders` to `never` or add the path to `git.ignoredRepositories`.

## License

MIT

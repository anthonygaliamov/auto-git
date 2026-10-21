# Changelog

## Unreleased

- Renamed the remaining `autoGit.*` command and setting ids to `autoSync.*`, and the UI labels from "Auto Git" to "Auto Sync". Existing `autoGit.*` settings are no longer read.

## 0.1.1

- Renamed the extension from `auto-git` to `auto-sync` because the name was taken on the Marketplace. The extension id is now `anthonygaliamov.auto-sync`.

## 0.1.0

- Repository discovery with scan depth, include and exclude lists.
- Fetch, fast-forward pull and push for the current branch, with safety checks.
- Timer, startup and window focus triggers.
- Commands: sync all, sync this repository, pause, resume, show log, show issues.
- Repos without a remote are ignored and never opened in Source Control.
- Pulls fast-forward to the fetched branch and never fetch tags or show the tag-conflict dialog.
- Status bar item with idle, syncing, paused and issue states.
- Notifications for diverged branches, rejected pushes, auth failures and `merge.ff=false`, shown once per problem.

## 0.0.1

- Project scaffold.

import * as assert from 'node:assert';
import * as path from 'node:path';
import {
  NotificationTracker,
  buildStatus,
  collectIssues,
  collectLocalOnly,
  describeNotification,
  type RepoIssue,
  type StatusInput,
} from '../../src/issues';
import type { SyncOutcome } from '../../src/outcome';

const root = (name: string): string => path.resolve('/work', name);

const diverged: SyncOutcome = {
  status: 'blocked',
  reason: 'diverged',
  issue: { kind: 'diverged', message: 'The branch has diverged.' },
};
const mergeFf: SyncOutcome = {
  status: 'blocked',
  reason: 'merge-ff-disabled',
  issue: { kind: 'config', message: 'merge.ff is false.' },
};
const autostash: SyncOutcome = {
  status: 'blocked',
  reason: 'autostash-dirty',
  issue: { kind: 'config', message: 'autostash.' },
};
const authFail: SyncOutcome = { status: 'failed', phase: 'fetch', issue: { kind: 'auth', message: 'fatal: nope' } };
const offline: SyncOutcome = { status: 'failed', phase: 'fetch', issue: { kind: 'network', message: 'offline' } };
const rejected: SyncOutcome = { status: 'failed', phase: 'push', issue: { kind: 'push-rejected', message: 'rejected' } };
const upToDate: SyncOutcome = { status: 'up-to-date' };
const localOnly: SyncOutcome = { status: 'skipped', reason: 'no-upstream' };

const issue = (name: string, overrides: Partial<RepoIssue> = {}): RepoIssue => ({
  root: root(name),
  kind: 'diverged',
  key: 'blocked:diverged',
  message: 'm',
  notify: true,
  ...overrides,
});

describe('collectIssues', () => {
  it('collects blocked and failed outcomes only, sorted by path', () => {
    const results = new Map<string, SyncOutcome>([
      [root('b'), authFail],
      [root('a'), diverged],
      [root('c'), upToDate],
      [root('d'), localOnly],
    ]);
    assert.deepStrictEqual(
      collectIssues(results).map((i) => [path.basename(i.root), i.kind]),
      [
        ['a', 'diverged'],
        ['b', 'auth'],
      ],
    );
  });

  it('marks which issues deserve a notification', () => {
    const notify = (o: SyncOutcome): boolean => collectIssues(new Map([[root('x'), o]]))[0].notify;
    assert.strictEqual(notify(diverged), true);
    assert.strictEqual(notify(rejected), true);
    assert.strictEqual(notify(authFail), true);
    assert.strictEqual(notify(mergeFf), true);
    assert.strictEqual(notify(offline), false);
    assert.strictEqual(notify(autostash), false);
    assert.strictEqual(
      notify({ status: 'failed', phase: 'pull', issue: { kind: 'local-changes', message: 'x' } }),
      false,
    );
  });

  it('gives different problems different keys', () => {
    const key = (o: SyncOutcome): string => collectIssues(new Map([[root('x'), o]]))[0].key;
    assert.notStrictEqual(key(diverged), key(authFail));
    assert.notStrictEqual(key(authFail), key(rejected));
    assert.strictEqual(key(authFail), key({ ...authFail, issue: { kind: 'auth', message: 'different words' } }));
  });
});

describe('collectLocalOnly', () => {
  it('lists repos on a branch with no upstream', () => {
    const results = new Map<string, SyncOutcome>([
      [root('b'), localOnly],
      [root('a'), localOnly],
      [root('c'), { status: 'skipped', reason: 'detached' }],
      [root('d'), upToDate],
    ]);
    assert.deepStrictEqual(collectLocalOnly(results), [root('a'), root('b')]);
  });
});

describe('buildStatus', () => {
  const base: StatusInput = { repoCount: 2, syncing: false, paused: false, issues: [], localOnly: [] };

  it('is idle with nothing to report, and opens the log when clicked', () => {
    const model = buildStatus(base);
    assert.strictEqual(model.state, 'idle');
    assert.strictEqual(model.text, '$(sync) Auto Sync');
    assert.strictEqual(model.command, 'showLog');
    assert.strictEqual(model.visible, true);
  });

  it('shows the issue count and opens the issues when clicked', () => {
    const model = buildStatus({ ...base, issues: [issue('a'), issue('b')] });
    assert.strictEqual(model.state, 'issues');
    assert.strictEqual(model.text, '$(warning) Auto Sync 2');
    assert.strictEqual(model.command, 'showIssues');
    assert.ok(model.tooltip.includes('a: Diverged. m'));
  });

  it('shows the paused state', () => {
    const model = buildStatus({ ...base, paused: true });
    assert.strictEqual(model.state, 'paused');
    assert.ok(model.tooltip.includes('Paused'));
  });

  it('prefers syncing over everything, and issues over paused', () => {
    assert.strictEqual(buildStatus({ ...base, syncing: true, paused: true, issues: [issue('a')] }).state, 'syncing');
    assert.strictEqual(buildStatus({ ...base, paused: true, issues: [issue('a')] }).state, 'issues');
  });

  it('still says paused in the tooltip when issues take the icon', () => {
    assert.ok(buildStatus({ ...base, paused: true, issues: [issue('a')] }).tooltip.includes('Paused'));
  });

  it('is hidden when no repositories are tracked', () => {
    assert.strictEqual(buildStatus({ ...base, repoCount: 0 }).visible, false);
  });

  it('mentions the last sync and local-only branches without counting them as issues', () => {
    const model = buildStatus({ ...base, lastSync: '14:32', localOnly: [root('topic')] });
    assert.strictEqual(model.state, 'idle');
    assert.ok(model.tooltip.includes('Last sync 14:32.'));
    assert.ok(model.tooltip.includes('local-only branch'));
    assert.ok(model.tooltip.includes('topic'));
  });

  it('caps long lists', () => {
    const many = Array.from({ length: 12 }, (_, i) => issue(`repo${String(i).padStart(2, '0')}`));
    const tooltip = buildStatus({ ...base, issues: many }).tooltip;
    assert.ok(tooltip.includes('and 4 more'));
    assert.ok(!tooltip.includes('repo11'));
  });

  it('uses the singular for one repository', () => {
    assert.ok(buildStatus({ ...base, repoCount: 1 }).tooltip.includes('Tracking 1 repository.'));
  });
});

describe('NotificationTracker', () => {
  it('reports an issue once', () => {
    const tracker = new NotificationTracker();
    assert.strictEqual(tracker.next([issue('a')]).length, 1);
    assert.strictEqual(tracker.next([issue('a')]).length, 0);
    assert.strictEqual(tracker.next([issue('a')]).length, 0);
  });

  it('reports again after the issue clears and returns', () => {
    const tracker = new NotificationTracker();
    tracker.next([issue('a')]);
    assert.strictEqual(tracker.next([]).length, 0);
    assert.strictEqual(tracker.next([issue('a')]).length, 1);
  });

  it('reports again when the problem changes', () => {
    const tracker = new NotificationTracker();
    tracker.next([issue('a')]);
    const changed = tracker.next([issue('a', { kind: 'auth', key: 'failed:fetch:auth' })]);
    assert.strictEqual(changed.length, 1);
  });

  it('tracks repositories separately', () => {
    const tracker = new NotificationTracker();
    tracker.next([issue('a')]);
    const fresh = tracker.next([issue('a'), issue('b')]);
    assert.deepStrictEqual(
      fresh.map((i) => i.root),
      [root('b')],
    );
  });

  it('ignores issues that are not worth a notification', () => {
    const tracker = new NotificationTracker();
    assert.deepStrictEqual(tracker.next([issue('a', { notify: false })]), []);
  });

  it('treats an issue that stops being notifiable as cleared', () => {
    const tracker = new NotificationTracker();
    tracker.next([issue('a')]);
    tracker.next([issue('a', { notify: false })]);
    assert.strictEqual(tracker.next([issue('a')]).length, 1);
  });
});

describe('describeNotification', () => {
  it('names the repo and problem for a single issue', () => {
    assert.strictEqual(describeNotification([issue('a', { message: 'It diverged.' })]), 'Auto Sync: a: It diverged.');
  });

  it('summarises several issues', () => {
    assert.strictEqual(describeNotification([issue('a'), issue('b')]), 'Auto Sync: 2 repositories need attention.');
  });
});

import * as vscode from 'vscode';
import type { RepoDiscovery } from './discovery';
import {
  KIND_LABELS,
  NotificationTracker,
  buildStatus,
  collectIssues,
  collectLocalOnly,
  describeNotification,
  repoName,
  type RepoIssue,
} from './issues';
import type { Scheduler } from './scheduler';
import { readSettings } from './settings';
import type { SyncService } from './syncService';

export const UI_COMMANDS = {
  showIssues: 'autoSync.showIssues',
  showLog: 'autoSync.showLog',
} as const;

/** Keeps the status bar item and problem notifications in step with the sync results. */
export class StatusController implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('autoSync.status', vscode.StatusBarAlignment.Left, 0);
  private readonly tracker = new NotificationTracker();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly discovery: RepoDiscovery,
    private readonly service: SyncService,
    private readonly scheduler: Scheduler,
  ) {
    this.item.name = 'Auto Sync';
    this.disposables.push(
      this.item,
      service.onDidChange(() => this.refresh()),
      discovery.onDidChange(() => this.refresh()),
    );
    this.refresh();
  }

  /** Text currently shown in the status bar. */
  get text(): string {
    return this.item.text;
  }

  /** Current problems, for the Show Issues command. */
  get issues(): RepoIssue[] {
    return collectIssues(this.service.results);
  }

  refresh(): void {
    const issues = this.issues;
    const syncing = this.service.syncing;
    const model = buildStatus({
      repoCount: this.discovery.getRepositories().length,
      syncing,
      paused: this.scheduler.paused,
      issues,
      localOnly: collectLocalOnly(this.service.results),
      lastSync: this.service.lastSyncAt?.toLocaleTimeString(),
    });

    this.item.text = model.text;
    this.item.tooltip = new vscode.MarkdownString(model.tooltip.replace(/\n/g, '  \n'));
    this.item.command = model.command === 'showIssues' ? UI_COMMANDS.showIssues : UI_COMMANDS.showLog;
    this.item.backgroundColor =
      model.state === 'issues' ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    if (model.visible) {
      this.item.show();
    } else {
      this.item.hide();
    }

    // Notify once a run has finished, not as each repo reports in.
    if (!syncing) {
      this.notify(issues);
    }
  }

  private notify(issues: readonly RepoIssue[]): void {
    const fresh = this.tracker.next(issues);
    if (fresh.length === 0 || !readSettings().notifications) {
      return;
    }
    void vscode.window
      .showWarningMessage(describeNotification(fresh), 'Show Issues', 'Show Log')
      .then((choice) => {
        if (choice === 'Show Issues') {
          return vscode.commands.executeCommand(UI_COMMANDS.showIssues);
        }
        if (choice === 'Show Log') {
          return vscode.commands.executeCommand(UI_COMMANDS.showLog);
        }
        return undefined;
      });
  }

  /** Lists the repos that need attention. Picking one opens a terminal in it. */
  async showIssues(): Promise<void> {
    const issues = this.issues;
    if (issues.length === 0) {
      void vscode.window.showInformationMessage('Auto Sync: no repositories need attention.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      issues.map((issue) => ({
        label: repoName(issue.root),
        description: KIND_LABELS[issue.kind],
        detail: `${issue.message}  (${issue.root})`,
        issue,
      })),
      { placeHolder: 'Pick a repository to open a terminal in it' },
    );
    if (picked) {
      vscode.window.createTerminal({ cwd: picked.issue.root, name: `Auto Sync: ${repoName(picked.issue.root)}` }).show();
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}

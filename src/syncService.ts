import * as vscode from 'vscode';
import { mapLimit } from './concurrency';
import type { RepoDiscovery } from './discovery';
import type { Repository } from './git';
import type { Logger } from './log';
import { describeOutcome, describeSummary, shouldLog, summarizeRun, type RunSummary, type SyncOutcome } from './outcome';
import type { RepoSyncer } from './syncRepo';

const MAX_PARALLEL = 4;

/** Syncs every tracked repository and remembers the latest outcome for each. */
export class SyncService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly outcomes = new Map<string, SyncOutcome>();
  private current: Promise<RunSummary> | undefined;
  private active = 0;

  readonly onDidChange = this.changed.event;

  constructor(
    private readonly discovery: RepoDiscovery,
    private readonly syncer: RepoSyncer,
    private readonly log: Logger,
  ) {}

  get syncing(): boolean {
    return this.current !== undefined || this.active > 0;
  }

  /** Latest outcome per repository root path. */
  get results(): ReadonlyMap<string, SyncOutcome> {
    return this.outcomes;
  }

  /** Calls made while a run is in progress share that run. */
  syncAll(manual: boolean): Promise<RunSummary> {
    if (!this.current) {
      this.current = this.runAll(manual).finally(() => {
        this.current = undefined;
        this.changed.fire();
      });
      this.changed.fire();
    }
    return this.current;
  }

  syncOne(repository: Repository, manual = true): Promise<SyncOutcome> {
    return this.syncRepository(repository, manual);
  }

  private async runAll(manual: boolean): Promise<RunSummary> {
    await this.discovery.refresh();
    const repositories = this.discovery.getRepositories();

    const tracked = new Set(repositories.map((r) => r.rootUri.fsPath));
    for (const root of this.outcomes.keys()) {
      if (!tracked.has(root)) {
        this.outcomes.delete(root);
      }
    }

    const outcomes = await mapLimit(repositories, MAX_PARALLEL, (r) => this.syncRepository(r, manual));
    const summary = summarizeRun(outcomes);
    if (manual) {
      this.log.info(describeSummary(summary));
    }
    return summary;
  }

  private async syncRepository(repository: Repository, manual: boolean): Promise<SyncOutcome> {
    const root = repository.rootUri.fsPath;
    this.active++;
    this.changed.fire();
    let outcome: SyncOutcome;
    try {
      outcome = await this.syncer.sync(repository);
    } finally {
      this.active--;
    }

    const busy = outcome.status === 'skipped' && outcome.reason === 'busy';
    // A busy result says nothing about the repo, so keep the previous outcome.
    const previous = this.outcomes.get(root);
    if (!busy) {
      this.outcomes.set(root, outcome);
    }
    if (manual || (!busy && shouldLog(previous, outcome, false))) {
      this.log.info(`${root}: ${describeOutcome(outcome)}`);
    }
    this.changed.fire();
    return outcome;
  }

  dispose(): void {
    this.changed.dispose();
  }
}

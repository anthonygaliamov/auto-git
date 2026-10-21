export interface TimerApi {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SchedulerOptions {
  run: () => Promise<void>;
  intervalMs: () => number;
  onError?: (err: unknown) => void;
  now?: () => number;
  timers?: TimerApi;
}

/**
 * Runs a job on a timer without ever overlapping runs: the next run is scheduled
 * one interval after the previous one finishes. Knows nothing about VS Code or git.
 */
export class Scheduler {
  private readonly now: () => number;
  private readonly timers: TimerApi;
  private handle: unknown;
  private current: Promise<void> | undefined;
  private lastRunAt: number | undefined;
  private started = false;
  private isPaused = false;

  constructor(private readonly options: SchedulerOptions) {
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? realTimers;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** Begins scheduling. The first run happens after `firstDelayMs`. */
  start(firstDelayMs: number): void {
    this.started = true;
    if (!this.isPaused) {
      this.schedule(firstDelayMs);
    }
  }

  stop(): void {
    this.started = false;
    this.clearTimer();
  }

  pause(): void {
    this.isPaused = true;
    this.clearTimer();
  }

  /** Resuming runs a sync straight away, since changes may have piled up. */
  resume(): void {
    if (!this.isPaused) {
      return;
    }
    this.isPaused = false;
    if (this.started) {
      this.schedule(0);
    }
  }

  /** Runs now, even while paused. Calls made during a run share that run. */
  runNow(): Promise<void> {
    if (this.current) {
      return this.current;
    }
    this.clearTimer();
    this.lastRunAt = this.now();
    this.current = (async () => {
      try {
        await this.options.run();
      } catch (err) {
        this.options.onError?.(err);
      }
    })().finally(() => {
      this.current = undefined;
      if (this.started && !this.isPaused) {
        this.schedule(this.options.intervalMs());
      }
    });
    return this.current;
  }

  /** The window regained focus: run only if the last run is at least one interval old. */
  focus(): void {
    if (!this.started || this.isPaused || this.current) {
      return;
    }
    if (this.lastRunAt === undefined || this.now() - this.lastRunAt >= this.options.intervalMs()) {
      void this.runNow();
    }
  }

  /** Call after the interval setting changes. */
  reschedule(): void {
    if (this.started && !this.isPaused && !this.current) {
      this.schedule(this.options.intervalMs());
    }
  }

  dispose(): void {
    this.stop();
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.handle = this.timers.set(() => {
      this.handle = undefined;
      void this.runNow();
    }, ms);
  }

  private clearTimer(): void {
    if (this.handle !== undefined) {
      this.timers.clear(this.handle);
      this.handle = undefined;
    }
  }
}

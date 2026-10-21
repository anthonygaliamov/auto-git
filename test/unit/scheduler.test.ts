import * as assert from 'node:assert';
import { Scheduler, type TimerApi } from '../../src/scheduler';

class FakeClock implements TimerApi {
  time = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  set(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  }

  clear(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  get pending(): number {
    return this.timers.size;
  }

  /** Advances time, firing due timers in order and letting async work settle in between. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) {
        break;
      }
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
      await settle();
    }
    this.time = end;
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const MIN = 60_000;

describe('Scheduler', () => {
  let clock: FakeClock;
  let runs: number;
  let hold: (() => void) | undefined;
  let errors: unknown[];
  let scheduler: Scheduler;

  function make(job?: () => Promise<void>): Scheduler {
    return new Scheduler({
      run: job ?? (async () => void runs++),
      intervalMs: () => 5 * MIN,
      onError: (e) => errors.push(e),
      now: () => clock.time,
      timers: clock,
    });
  }

  beforeEach(() => {
    clock = new FakeClock();
    runs = 0;
    hold = undefined;
    errors = [];
    scheduler = make();
  });

  afterEach(() => scheduler.dispose());

  it('does nothing before it is started', async () => {
    await clock.advance(60 * MIN);
    assert.strictEqual(runs, 0);
  });

  it('runs after the first delay, then every interval', async () => {
    scheduler.start(5000);
    await clock.advance(4999);
    assert.strictEqual(runs, 0);
    await clock.advance(1);
    assert.strictEqual(runs, 1);
    await clock.advance(5 * MIN);
    assert.strictEqual(runs, 2);
    await clock.advance(5 * MIN);
    assert.strictEqual(runs, 3);
  });

  it('never overlaps runs, and times the next one from when the last finished', async () => {
    let finished = 0;
    scheduler = make(async () => {
      runs++;
      await new Promise<void>((resolve) => (hold = resolve));
      finished++;
    });
    scheduler.start(0);
    await clock.advance(0);
    assert.strictEqual(runs, 1);

    await clock.advance(20 * MIN);
    assert.strictEqual(runs, 1, 'a run is still going');

    hold?.();
    await settle();
    assert.strictEqual(finished, 1);
    await clock.advance(5 * MIN - 1);
    assert.strictEqual(runs, 1);
    await clock.advance(1);
    assert.strictEqual(runs, 2);
  });

  it('shares one run between overlapping runNow calls', async () => {
    scheduler = make(async () => {
      runs++;
      await new Promise<void>((resolve) => (hold = resolve));
    });
    const a = scheduler.runNow();
    const b = scheduler.runNow();
    assert.strictEqual(a, b);
    hold?.();
    await a;
    assert.strictEqual(runs, 1);
  });

  it('stops scheduling while paused, and still allows a manual run', async () => {
    scheduler.start(1000);
    scheduler.pause();
    assert.strictEqual(scheduler.paused, true);
    assert.strictEqual(clock.pending, 0);
    await clock.advance(60 * MIN);
    assert.strictEqual(runs, 0);

    await scheduler.runNow();
    assert.strictEqual(runs, 1);
    assert.strictEqual(clock.pending, 0, 'a manual run must not restart the timer while paused');
  });

  it('runs straight away on resume, then keeps its interval', async () => {
    scheduler.start(1000);
    scheduler.pause();
    scheduler.resume();
    assert.strictEqual(scheduler.paused, false);
    await clock.advance(0);
    assert.strictEqual(runs, 1);
    await clock.advance(5 * MIN);
    assert.strictEqual(runs, 2);
  });

  it('does not run on resume if it was not paused', async () => {
    scheduler.start(10 * MIN);
    scheduler.resume();
    await clock.advance(1000);
    assert.strictEqual(runs, 0);
  });

  it('does not schedule on start if paused first', async () => {
    scheduler.pause();
    scheduler.start(0);
    await clock.advance(10 * MIN);
    assert.strictEqual(runs, 0);
  });

  it('only syncs on focus once the last run is an interval old', async () => {
    scheduler.start(0);
    await clock.advance(0);
    assert.strictEqual(runs, 1);

    clock.time += 2 * MIN;
    scheduler.focus();
    await settle();
    assert.strictEqual(runs, 1);

    clock.time += 3 * MIN;
    scheduler.focus();
    await settle();
    assert.strictEqual(runs, 2);
  });

  it('syncs on focus if it has never run', async () => {
    scheduler.start(30 * MIN);
    scheduler.focus();
    await settle();
    assert.strictEqual(runs, 1);
  });

  it('ignores focus when paused or stopped', async () => {
    scheduler.start(30 * MIN);
    scheduler.pause();
    scheduler.focus();
    await settle();
    assert.strictEqual(runs, 0, 'paused');

    scheduler.resume();
    scheduler.stop();
    scheduler.focus();
    await clock.advance(60 * MIN);
    assert.strictEqual(runs, 0, 'stopped');
  });

  it('keeps going after a failed run and reports the error', async () => {
    scheduler = make(async () => {
      runs++;
      throw new Error('boom');
    });
    scheduler.start(0);
    await clock.advance(0);
    await clock.advance(5 * MIN);
    assert.strictEqual(runs, 2);
    assert.strictEqual(errors.length, 2);
  });

  it('stop cancels the pending run', async () => {
    scheduler.start(1000);
    scheduler.stop();
    await clock.advance(10 * MIN);
    assert.strictEqual(runs, 0);
  });

  it('reschedule moves the next run to the new interval', async () => {
    let interval = 60 * MIN;
    scheduler = new Scheduler({
      run: async () => void runs++,
      intervalMs: () => interval,
      now: () => clock.time,
      timers: clock,
    });
    scheduler.start(0);
    await clock.advance(0);
    assert.strictEqual(runs, 1);

    interval = 5 * MIN;
    scheduler.reschedule();
    await clock.advance(5 * MIN);
    assert.strictEqual(runs, 2);
  });
});

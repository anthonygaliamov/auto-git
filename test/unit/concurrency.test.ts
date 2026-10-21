import * as assert from 'node:assert';
import { mapLimit } from '../../src/concurrency';

describe('mapLimit', () => {
  it('keeps input order', async () => {
    const result = await mapLimit([30, 1, 10], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    assert.deepStrictEqual(result, [30, 1, 10]);
  });

  it('never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });
    assert.strictEqual(peak, 3);
  });

  it('handles an empty list', async () => {
    assert.deepStrictEqual(await mapLimit([], 4, async (x) => x), []);
  });

  it('treats a limit below 1 as 1', async () => {
    assert.deepStrictEqual(await mapLimit([1, 2], 0, async (x) => x * 2), [2, 4]);
  });
});

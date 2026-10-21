/** Like `Promise.all(items.map(fn))`, but with at most `limit` calls running at once. Results keep input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

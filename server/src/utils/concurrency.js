/**
 * Runs `fn` over `items` with at most `limit` in flight at once — plain
 * `Promise.all(items.map(fn))` is fine for cheap/independent DB calls, but for
 * per-item LLM/news/external-API calls (aiScanJob, autoTradingService context
 * prefetch) an unbounded fan-out risks hammering rate limits on a large watchlist.
 * @template T, R
 * @param {T[]} items @param {number} limit @param {(item:T, index:number) => Promise<R>} fn
 * @returns {Promise<R[]>} results in the same order as `items` (a failed item's
 *   result is whatever `fn` itself resolves/rejects to — callers should catch inside `fn`)
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

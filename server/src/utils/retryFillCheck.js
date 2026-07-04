import { sleep } from './sleep.js';

/**
 * Retries a broker order-status check a few times with short backoff right after
 * placing an order. A MARKET order on NSE cash equity typically fills within ~1-2s,
 * but immediately calling getOrderStatus() can still race the broker's own order-list/
 * history endpoint not having caught up yet — a single unretried check (the original
 * approach) missed this often enough that live fills were silently never recorded.
 * This doesn't fully eliminate the race (see orderReconciliationJob.js for the backstop
 * that catches whatever still slips through), but it resolves the common case inline
 * instead of waiting for the next reconciliation pass.
 * @param {() => Promise<{status:string, filledPrice?:number, filledQuantity?:number}>} checkFn
 * @param {number} [attempts]
 * @param {number[]} [delaysMs]
 * @returns {Promise<{status:string, filledPrice?:number, filledQuantity?:number}|null>} null if checkFn kept throwing (e.g. order not found yet) every attempt
 */
export async function retryFillCheck(checkFn, attempts = 3, delaysMs = [300, 700, 1200]) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delaysMs[i - 1] ?? delaysMs.at(-1));
    try {
      last = await checkFn();
      if (last.status === 'FILLED' || !['PLACED', 'PENDING'].includes(last.status)) return last;
    } catch {
      // Order hasn't propagated into the broker's list/history endpoint yet — retry.
    }
  }
  return last;
}

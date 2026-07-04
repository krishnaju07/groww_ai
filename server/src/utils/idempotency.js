import crypto from 'node:crypto';

/**
 * Deterministic key to dedupe accidental double-submits of the same order within
 * the same second — two calls with identical (userId, symbol, action, quantity)
 * within the same 1s bucket produce the IDENTICAL key, which trips Order's unique
 * index on idempotencyKey (see orderService.js's duplicate-key handling). This
 * MUST stay deterministic — a random component here would silently defeat the
 * whole point (every key would be unique, so the unique index could never catch
 * a real duplicate). Callers may pass their own key (e.g. a client-generated UUID)
 * instead when one is available.
 * @param {{userId:string, symbol:string, action:string, quantity:number}} o
 * @returns {string}
 */
export function generateIdempotencyKey(o) {
  const bucket = Math.floor(Date.now() / 1000);
  const raw = `${o.userId}:${o.symbol}:${o.action}:${o.quantity}:${bucket}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

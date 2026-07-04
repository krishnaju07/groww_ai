import crypto from 'node:crypto';

/**
 * Deterministic-enough key to dedupe accidental double-submits of the same order
 * within the same second. Callers may pass their own key (e.g. a client-generated
 * UUID) instead when one is available.
 * @param {{userId:string, symbol:string, action:string, quantity:number}} o
 * @returns {string}
 */
export function generateIdempotencyKey(o) {
  const bucket = Math.floor(Date.now() / 1000);
  const raw = `${o.userId}:${o.symbol}:${o.action}:${o.quantity}:${bucket}:${crypto.randomBytes(4).toString('hex')}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

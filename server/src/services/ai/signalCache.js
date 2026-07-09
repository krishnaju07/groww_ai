/**
 * Fast "latest signal per symbol" lookup, populated by aiScanJob.js. Deliberately
 * in-process (not DB) — it's a cache, not a record; full decision history
 * already persists via AIDecisionLog. Powers the Dashboard "AI Top Picks"
 * section, StockSelector badges, and Portfolio "AI View" exit hints.
 */
const cache = new Map(); // symbol -> {action, confidence, reason, justification, scoreBreakdown, updatedAt}

/** @param {string} symbol @param {{action:string, confidence:number, reason:string, justification?:string, scoreBreakdown?:object}} signal */
export function setSignal(symbol, signal) {
  cache.set(symbol, { ...signal, updatedAt: new Date() });
}

/** @param {string} symbol @returns {object|null} */
export function getSignal(symbol) {
  return cache.get(symbol) ?? null;
}

/** @returns {Record<string, object>} every cached signal, keyed by symbol */
export function getAllSignals() {
  return Object.fromEntries(cache.entries());
}

/**
 * This symbol's own historical AI-decision performance (win rate / avg P&L across every
 * past AI/ensemble-triggered CLOSED trade) — fed back into the decision context so the AI
 * knows "my last calls on this stock did well/poorly" and weighs confidence accordingly,
 * rather than treating every symbol as a blank slate each time. Reuses the same
 * aiDecisionId-linked Trade query /api/ai/stats already aggregates account-wide.
 */
import { Trade } from '../../models/Trade.js';
import { round2 } from '../../utils/format.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // `${userId}:${symbol}` -> {result, fetchedAt}

/** @param {string} userId @param {string} symbol @returns {Promise<{totalClosed:number, winRate:number|null, avgPnl:number|null}>} */
export async function getTrackRecord(userId, symbol) {
  const key = `${userId}:${symbol}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.result;

  const trades = await Trade.find({ userId, symbol, aiDecisionId: { $ne: null }, status: 'CLOSED' })
    .select('pnl')
    .lean();
  const totalClosed = trades.length;
  const winCount = trades.filter((t) => (t.pnl || 0) > 0).length;
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  const result = {
    totalClosed,
    winRate: totalClosed ? round2((winCount / totalClosed) * 100) : null,
    avgPnl: totalClosed ? round2(totalPnl / totalClosed) : null,
  };
  cache.set(key, { result, fetchedAt: Date.now() });
  return result;
}

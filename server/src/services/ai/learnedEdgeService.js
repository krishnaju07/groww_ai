/**
 * Learned Edge / Expected-Value gate — the "AI evolves instead of repeating mistakes"
 * layer (the user's #1 priority). Before committing a fresh entry, it looks at how the
 * AI's OWN past closed trades performed under the SAME conditions (market regime, option
 * side, entry hour) and computes the expected value of trading this setup again. If a
 * condition has a proven losing record over a meaningful sample, the trade is vetoed —
 * capital preservation beats taking a bet history says loses money.
 *
 * Deterministic and cache-light; no LLM cost. Reads the same aiDecisionId-linked closed
 * Trade data the Learning Engine (analyticsService) reports on.
 */
import { Trade } from '../../models/Trade.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { round2 } from '../../utils/format.js';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map(); // `${userId}:${mode}` -> {rows, fetchedAt}

/** @param {string|Date} d @returns {number} IST hour-of-day (0-23) */
function istHour(d) {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * Every closed AI trade joined to the regime/hour that was in effect at entry. Cached
 * briefly per user+mode so a scan tick doesn't re-query for each symbol. Scoped to `mode`
 * so a paper trade's fake-money history can never veto a live entry (or the reverse) —
 * each account learns only from its own outcomes.
 * @param {string} userId @param {'paper'|'live'} mode
 * @returns {Promise<Array<{pnl:number, regime:string|null, optionType:string|null, hour:number}>>}
 */
async function loadHistory(userId, mode) {
  const cacheKey = `${userId}:${mode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.rows;

  const trades = await Trade.find({ userId, mode, status: 'CLOSED', aiDecisionId: { $ne: null } })
    .select('pnl optionType openedAt aiDecisionId')
    .lean();
  const decIds = trades.map((t) => t.aiDecisionId).filter(Boolean);
  const decisions = await AIDecisionLog.find({ _id: { $in: decIds } }).select('indicatorsSnapshot.regime.regime strategy').lean();
  const decisionById = new Map(decisions.map((d) => [String(d._id), d]));

  const rows = trades.map((t) => {
    const d = decisionById.get(String(t.aiDecisionId));
    return {
      pnl: t.pnl || 0,
      regime: d?.indicatorsSnapshot?.regime?.regime ?? null,
      optionType: t.optionType ?? null,
      // DIRECTIONAL is the pre-existing default for decisions logged before this field
      // existed — treated as directional, which is what they all were.
      strategy: d?.strategy ?? 'DIRECTIONAL',
      hour: istHour(t.openedAt),
    };
  });
  cache.set(cacheKey, { rows, fetchedAt: Date.now() });
  return rows;
}

/**
 * Invalidate a user+mode's cached history (call after a trade closes so the next gate
 * sees it). `mode` omitted clears both paper and live entries for the user.
 * @param {string} userId @param {'paper'|'live'} [mode]
 */
export function invalidateEdgeCache(userId, mode) {
  if (!userId) {
    cache.clear();
    return;
  }
  if (mode) cache.delete(`${userId}:${mode}`);
  else {
    cache.delete(`${userId}:paper`);
    cache.delete(`${userId}:live`);
  }
}

/**
 * @param {number[]} pnls
 * @returns {{count:number, winRate:number, avgWin:number, avgLoss:number, expectedValue:number}}
 */
function stats(pnls) {
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const pWin = pnls.length ? wins.length / pnls.length : 0;
  const avgWin = wins.length ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, p) => s + p, 0) / losses.length : 0; // negative
  // EV per trade = P(win)·avgWin + P(loss)·avgLoss. Positive ⇒ this setup has made money.
  const expectedValue = round2(pWin * avgWin + (1 - pWin) * avgLoss);
  return { count: pnls.length, winRate: round2(pWin * 100), avgWin: round2(avgWin), avgLoss: round2(avgLoss), expectedValue };
}

/**
 * Verdict on whether the AI should take a setup, based on its own track record under the
 * same conditions.
 *
 * @param {string} userId @param {'paper'|'live'} mode
 * @param {{regime?:string|null, optionType?:string|null, hour?:number|null, strategy?:string|null}} setup
 * @param {{minSample?:number}} [opts] minSample = trades a bucket needs before it may VETO
 * @returns {Promise<{verdict:'PROCEED'|'CAUTION'|'VETO', reason:string, worst:object|null, buckets:object[]}>}
 */
export async function getLearnedEdge(userId, mode, setup, opts = {}) {
  const minSample = opts.minSample ?? 5;
  let rows = await loadHistory(userId, mode);

  // A straddle's P&L pattern (one leg wins big, the other decays to near-zero) is
  // fundamentally different from a directional CE/PE bet's — averaging them into the same
  // regime/side/hour buckets would corrupt both track records. When the setup names a
  // strategy, restrict history to that strategy FIRST, before building any dimension.
  if (setup.strategy) rows = rows.filter((r) => r.strategy === setup.strategy);

  // Build a bucket per dimension we have a value for. Each bucket is only allowed to VETO
  // once it has minSample trades — below that it's informational, so the AI isn't paralysed
  // by one or two unlucky early trades.
  const dims = [];
  if (setup.regime) dims.push({ key: `regime=${setup.regime}`, match: (r) => r.regime === setup.regime });
  if (setup.optionType) dims.push({ key: `side=${setup.optionType}`, match: (r) => r.optionType === setup.optionType });
  if (setup.hour != null) dims.push({ key: `hour=${setup.hour}:00`, match: (r) => r.hour === setup.hour });

  const buckets = dims
    .map((d) => ({ key: d.key, ...stats(rows.filter(d.match).map((r) => r.pnl)) }))
    .filter((b) => b.count > 0);

  if (!buckets.length) {
    return { verdict: 'PROCEED', reason: 'No prior AI trades under these conditions — nothing learned to veto on.', worst: null, buckets: [] };
  }

  // The most negative-EV bucket with a large enough sample governs the verdict — one
  // proven-losing condition is enough to stand aside, even if others look fine.
  const vetoable = buckets.filter((b) => b.count >= minSample && b.expectedValue < 0).sort((a, b) => a.expectedValue - b.expectedValue);
  if (vetoable.length) {
    const w = vetoable[0];
    return {
      verdict: 'VETO',
      reason: `Learned edge: ${w.key} has lost money historically (${w.winRate}% win, EV ₹${w.expectedValue}/trade over ${w.count} trades) — standing aside.`,
      worst: w,
      buckets,
    };
  }

  // Small-sample negative signals downgrade to CAUTION (informational, doesn't block).
  const cautions = buckets.filter((b) => b.expectedValue < 0);
  if (cautions.length) {
    const w = cautions.sort((a, b) => a.expectedValue - b.expectedValue)[0];
    return { verdict: 'CAUTION', reason: `Thin-but-negative history on ${w.key} (${w.count} trades, EV ₹${w.expectedValue}) — proceeding, watching.`, worst: w, buckets };
  }

  const best = [...buckets].sort((a, b) => b.expectedValue - a.expectedValue)[0];
  return { verdict: 'PROCEED', reason: `Positive learned edge (best: ${best.key}, EV ₹${best.expectedValue} over ${best.count} trades).`, worst: null, buckets };
}

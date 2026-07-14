/**
 * "Clear records" (Settings → Danger Zone) — permanently wipes one account's (paper or
 * live) trade history. Paper vs live must never bleed into each other here any more than
 * anywhere else in the app: clearing a fresh paper account back to a clean slate must never
 * touch a single real Trade/Order row, and vice versa.
 */
import { Trade } from '../models/Trade.js';
import { Order } from '../models/Order.js';
import { Position } from '../models/Position.js';
import { TradeCritique } from '../models/TradeCritique.js';
import { AIDecisionLog } from '../models/AIDecisionLog.js';
import { User } from '../models/User.js';
import { invalidateEdgeCache } from './ai/learnedEdgeService.js';

function codedError(message, code, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

/** Position has no `mode` field, only `broker` — 'paper' is always exactly that broker; every other broker is real/live. */
function positionFilterFor(mode) {
  return mode === 'paper' ? { broker: 'paper' } : { broker: { $ne: 'paper' } };
}

/** @param {string} userId @param {'paper'|'live'} mode @returns {Promise<{openPositions:number, totalTrades:number, totalOrders:number}>} */
export async function getRecordsSummary(userId, mode) {
  const [openPositions, totalTrades, totalOrders] = await Promise.all([
    Position.countDocuments({ userId, ...positionFilterFor(mode) }),
    Trade.countDocuments({ userId, mode }),
    Order.countDocuments({ userId, mode }),
  ]);
  return { openPositions, totalTrades, totalOrders };
}

/**
 * Permanently deletes a mode's Trade/Order/TradeCritique history. Refuses while any
 * position for that mode is still open — deleting the Position doc out from under a still-
 * open position (paper or live) would desync the app from exposure it can no longer see or
 * manage (positionGuardianJob/squareOffJob would lose track of it entirely). AIDecisionLog/
 * RiskEvent are left alone — they're an audit trail (including WAIT decisions never tied to
 * a mode), not P&L-bearing records.
 *
 * Paper mode additionally resets the paper ledger's cash balance back to startingCapital —
 * "clear paper records" means a clean slate, not erased history with stale realized P&L
 * still baked into the balance. Live mode has no such reset: real cash belongs to the
 * broker, not this app, to give back.
 *
 * @param {string} userId @param {'paper'|'live'} mode
 * @returns {Promise<{tradesDeleted:number, ordersDeleted:number, critiquesDeleted:number, capitalReset:boolean}>}
 */
export async function clearRecords(userId, mode) {
  const openPositions = await Position.countDocuments({ userId, ...positionFilterFor(mode) });
  if (openPositions > 0) {
    throw codedError(
      `Cannot clear ${mode} records while ${openPositions} position(s) are still open — close them first.`,
      'OPEN_POSITIONS_EXIST',
      409,
    );
  }

  const tradeIds = await Trade.find({ userId, mode }).distinct('_id');
  const [critiquesResult, tradesResult, ordersResult] = await Promise.all([
    TradeCritique.deleteMany({ userId, tradeId: { $in: tradeIds } }),
    Trade.deleteMany({ userId, mode }),
    Order.deleteMany({ userId, mode }),
  ]);

  let capitalReset = false;
  if (mode === 'paper') {
    const user = await User.findById(userId);
    if (user) {
      user.availableCapital = user.startingCapital;
      await user.save();
      capitalReset = true;
    }
  }

  invalidateEdgeCache(userId, mode);

  return {
    tradesDeleted: tradesResult.deletedCount,
    ordersDeleted: ordersResult.deletedCount,
    critiquesDeleted: critiquesResult.deletedCount,
    capitalReset,
  };
}

/**
 * AIDecisionLog — "every AI decision call, including WAIT" (see the model's own doc
 * comment) — powers the AI Decisions page and chart decision markers. Unlike Trade/Order,
 * it isn't tagged paper vs live (the background scan that produces most of these runs
 * regardless of trading mode), so there's nothing to split here — one account-wide log.
 * @param {string} userId @returns {Promise<{totalDecisions:number}>}
 */
export async function getAiCallRecordsSummary(userId) {
  const totalDecisions = await AIDecisionLog.countDocuments({ userId });
  return { totalDecisions };
}

/**
 * Deletes the AI call log. Trade/Position/Order rows that reference a deleted
 * aiDecisionId are unaffected — every read site already treats a missing/unlinked
 * decision as optional (`decision?.field`), so P&L history stays intact; only the "why"
 * narrative behind past decisions is gone. Also drops the learned-edge cache since it's
 * built from this same data.
 * @param {string} userId @returns {Promise<{decisionsDeleted:number}>}
 */
export async function clearAiCallRecords(userId) {
  const result = await AIDecisionLog.deleteMany({ userId });
  invalidateEdgeCache(userId);
  return { decisionsDeleted: result.deletedCount };
}

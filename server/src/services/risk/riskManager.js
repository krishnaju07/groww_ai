/**
 * The single source of truth for "can this order fire?" — enforced server-side
 * from orderService.placeOrder(), the sole choke point to a broker. Never trust
 * a client-supplied risk decision.
 */
import { Trade } from '../../models/Trade.js';
import { RiskEvent } from '../../models/RiskEvent.js';
import { User } from '../../models/User.js';
import { getRiskConfig } from './riskConfig.js';
import { isTripped } from './killSwitch.js';
import { round2 } from '../../utils/format.js';

function startOfTodayIst() {
  const now = new Date();
  const istNow = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  const start = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  return new Date(start.getTime() - (5 * 60 + 30) * 60 * 1000);
}

/** @param {string} userId @returns {Promise<{trades:number, realizedPnl:number, totalCapital:number, consecutiveLosses:number}>} */
async function computeTodayStats(userId) {
  const since = startOfTodayIst();
  const [tradeCount, closedToday, user] = await Promise.all([
    Trade.countDocuments({ userId, createdAt: { $gte: since } }),
    Trade.find({ userId, status: 'CLOSED', closedAt: { $gte: since } }).sort({ closedAt: 1 }).lean(),
    User.findById(userId).lean(),
  ]);
  const realizedPnl = round2(closedToday.reduce((sum, t) => sum + (t.pnl || 0), 0));

  // Consecutive losing trades counting back from the most recent close — a winner
  // (or scratch, pnl >= 0) breaks the streak. This is the "stop after N consecutive
  // losses / no revenge trading" signal.
  let consecutiveLosses = 0;
  for (let i = closedToday.length - 1; i >= 0; i--) {
    if ((closedToday[i].pnl || 0) < 0) consecutiveLosses++;
    else break;
  }

  return { trades: tradeCount, realizedPnl, totalCapital: user?.startingCapital ?? 100000, consecutiveLosses };
}

/**
 * @param {string} userId
 * @param {{symbol:string, action:'BUY'|'SELL', quantity:number, estimatedPrice:number, stopLoss?:number}} proposedOrder
 * @returns {Promise<import('../../types.js').CanTradeResult>}
 */
export async function canTrade(userId, proposedOrder) {
  const log = async (type, reason, context) => {
    await RiskEvent.create({ userId, type, reason, context });
  };

  if (await isTripped(userId)) {
    const result = { allowed: false, reason: 'Kill switch is engaged — trading is blocked until reset.' };
    await log('BLOCK', result.reason, { proposedOrder });
    return result;
  }

  const cfg = await getRiskConfig(userId);
  const today = await computeTodayStats(userId);

  if (today.trades >= cfg.maxTradesPerDay) {
    const result = { allowed: false, reason: `Max trades/day (${cfg.maxTradesPerDay}) reached.` };
    await log('BLOCK', result.reason, { proposedOrder, today });
    return result;
  }

  if (today.realizedPnl <= -Math.abs(cfg.maxLossPerDay)) {
    const result = { allowed: false, reason: `Daily loss limit ₹${cfg.maxLossPerDay} hit (realized ₹${today.realizedPnl}).` };
    await log('BLOCK', result.reason, { proposedOrder, today });
    return result;
  }

  // Capital%, profit-target, consecutive-loss, and per-trade-loss checks only meaningfully
  // apply to entries (BUY); a SELL just closes existing exposure and must never be blocked
  // by these (that would trap the platform in a position it's trying to exit).
  if (proposedOrder.action === 'BUY') {
    // Golden Rule — the ₹ daily profit target is the primary "stop when you've won"
    // gate; it takes precedence over the older percent-based lock. Once hit, new entries
    // stop for the day but existing positions keep being managed to close.
    if (cfg.dailyProfitTarget > 0 && today.realizedPnl >= cfg.dailyProfitTarget) {
      const result = {
        allowed: false,
        reason: `Daily profit target ₹${cfg.dailyProfitTarget} reached (realized ₹${today.realizedPnl}). New entries stopped for today — the day's goal is done. Existing positions can still be closed.`,
      };
      await log('BLOCK', result.reason, { proposedOrder, today });
      return result;
    }

    // "No revenge trading" — stop opening new positions after a losing streak, regardless
    // of whether the daily-₹ loss cap has been hit yet.
    if (cfg.maxConsecutiveLosses > 0 && today.consecutiveLosses >= cfg.maxConsecutiveLosses) {
      const result = {
        allowed: false,
        reason: `${today.consecutiveLosses} consecutive losing trades — new entries paused for today (no revenge trading). Existing positions can still be closed.`,
      };
      await log('BLOCK', result.reason, { proposedOrder, today });
      return result;
    }

    const profitLockPercent = cfg.dailyProfitLockPercent ?? 2;
    if (profitLockPercent > 0) {
      const profitLockAmount = round2((profitLockPercent / 100) * today.totalCapital);
      if (today.realizedPnl >= profitLockAmount) {
        const result = {
          allowed: false,
          reason: `Daily profit lock hit — realized ₹${today.realizedPnl} ≥ ${profitLockPercent}% of capital (₹${profitLockAmount}). New entries paused for today; existing positions can still be closed.`,
        };
        await log('BLOCK', result.reason, { proposedOrder, today });
        return result;
      }
    }

    const estValue = round2(proposedOrder.quantity * proposedOrder.estimatedPrice);
    const capitalPct = today.totalCapital ? round2((estValue / today.totalCapital) * 100) : 100;
    if (capitalPct > cfg.maxCapitalPerTradePercent) {
      const result = {
        allowed: false,
        reason: `Order is ${capitalPct}% of capital, exceeds the ${cfg.maxCapitalPerTradePercent}% cap.`,
      };
      await log('BLOCK', result.reason, { proposedOrder, today, capitalPct });
      return result;
    }

    if (proposedOrder.stopLoss) {
      const worstCase = round2(proposedOrder.quantity * Math.abs(proposedOrder.estimatedPrice - proposedOrder.stopLoss));
      if (worstCase > cfg.maxLossPerTrade) {
        const result = {
          allowed: false,
          reason: `Potential loss ₹${worstCase} exceeds the per-trade cap ₹${cfg.maxLossPerTrade}.`,
        };
        await log('BLOCK', result.reason, { proposedOrder, today, worstCase });
        return result;
      }
    }
  }

  const result = { allowed: true };
  await log('ALLOW', '', { proposedOrder, today });
  return result;
}

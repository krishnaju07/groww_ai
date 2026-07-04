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

/** @param {string} userId @returns {Promise<{trades:number, realizedPnl:number, totalCapital:number}>} */
async function computeTodayStats(userId) {
  const since = startOfTodayIst();
  const [tradeCount, closedToday, user] = await Promise.all([
    Trade.countDocuments({ userId, createdAt: { $gte: since } }),
    Trade.find({ userId, status: 'CLOSED', closedAt: { $gte: since } }).lean(),
    User.findById(userId).lean(),
  ]);
  const realizedPnl = round2(closedToday.reduce((sum, t) => sum + (t.pnl || 0), 0));
  return { trades: tradeCount, realizedPnl, totalCapital: user?.startingCapital ?? 100000 };
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

  // Capital% and per-trade-loss checks only meaningfully apply to entries (BUY); a SELL just closes exposure.
  if (proposedOrder.action === 'BUY') {
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

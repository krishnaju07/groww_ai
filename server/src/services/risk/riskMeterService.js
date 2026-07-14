import { Trade } from '../../models/Trade.js';
import { UserSettings } from '../../models/UserSettings.js';
import { effectiveMode } from '../brokers/tradingModeService.js';
import { getRiskConfig } from './riskConfig.js';
import { round2 } from '../../utils/format.js';

function startOfTodayIst() {
  const now = new Date();
  const istNow = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  const start = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  return new Date(start.getTime() - (5 * 60 + 30) * 60 * 1000);
}

/**
 * @param {string} userId
 * @returns {Promise<{score:number, tradesUsedPercent:number, lossUsedPercent:number, tradesToday:number, realizedPnlToday:number, cfg:object}>}
 */
export async function getRiskMeter(userId) {
  const cfg = await getRiskConfig(userId);
  const settings = await UserSettings.findOne({ userId }).lean();
  // Scoped to whichever account (paper/live) is effectively active — a paper-trading
  // session's trade count/P&L must never show up as "today's" risk usage against real
  // money, and vice versa.
  const mode = await effectiveMode(userId, settings);
  const since = startOfTodayIst();
  const [tradesToday, closedToday] = await Promise.all([
    Trade.countDocuments({ userId, mode, createdAt: { $gte: since } }),
    Trade.find({ userId, mode, status: 'CLOSED', closedAt: { $gte: since } }).lean(),
  ]);
  const realizedPnlToday = round2(closedToday.reduce((sum, t) => sum + (t.pnl || 0), 0));

  if (cfg.killSwitchEngaged) {
    return { score: 100, tradesUsedPercent: 100, lossUsedPercent: 100, tradesToday, realizedPnlToday, cfg };
  }

  const tradesUsedPercent = cfg.maxTradesPerDay ? round2((tradesToday / cfg.maxTradesPerDay) * 100) : 0;
  const lossUsedPercent = cfg.maxLossPerDay
    ? round2((Math.max(0, -realizedPnlToday) / cfg.maxLossPerDay) * 100)
    : 0;
  const score = Math.min(100, Math.round(Math.max(tradesUsedPercent, lossUsedPercent)));

  return { score, tradesUsedPercent, lossUsedPercent, tradesToday, realizedPnlToday, cfg };
}

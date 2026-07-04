import { Position } from '../models/Position.js';
import { Trade } from '../models/Trade.js';
import { User } from '../models/User.js';
import { UserSettings } from '../models/UserSettings.js';
import { marketData } from './marketData/index.js';
import { round2, percentOf } from '../utils/format.js';

/** @param {string} userId @returns {Promise<{broker:string, mode:string}>} */
async function activeBrokerAndMode(userId) {
  const settings = await UserSettings.findOne({ userId }).lean();
  return { broker: settings?.activeBroker ?? 'paper', mode: settings?.tradingMode ?? 'paper' };
}

/** @param {string} userId @returns {Promise<object>} */
export async function getPortfolio(userId) {
  const { broker } = await activeBrokerAndMode(userId);
  // Live-broker holdings aggregation lands in step 9 alongside the real adapters;
  // for now (paper-only) we always read the paper ledger, which is also the ledger
  // the dashboard should show whenever `mode` is 'paper'.
  const positions = await Position.find({ userId, broker: 'paper' }).lean();
  const symbols = positions.map((p) => p.symbol);
  const ltps = symbols.length ? await marketData.getLTPBatch(symbols) : {};

  const enriched = positions.map((p) => {
    const ltp = ltps[p.symbol] ?? p.avgBuyPrice;
    const currentValue = round2(ltp * p.quantity);
    const pnl = round2(currentValue - p.investedAmount);
    return {
      symbol: p.symbol,
      broker: p.broker,
      quantity: p.quantity,
      avgBuyPrice: p.avgBuyPrice,
      ltp,
      investedAmount: p.investedAmount,
      currentValue,
      pnl,
      pnlPercent: percentOf(pnl, p.investedAmount),
      stopLoss: p.stopLoss,
      target: p.target,
      openedAt: p.openedAt,
    };
  });

  const user = await User.findById(userId).lean();
  const investedTotal = round2(enriched.reduce((s, p) => s + p.investedAmount, 0));
  const currentValueTotal = round2(enriched.reduce((s, p) => s + p.currentValue, 0));
  const unrealizedPnl = round2(currentValueTotal - investedTotal);

  return {
    broker,
    availableCapital: user?.availableCapital ?? 0,
    startingCapital: user?.startingCapital ?? 0,
    investedTotal,
    currentValueTotal,
    unrealizedPnl,
    unrealizedPnlPercent: percentOf(unrealizedPnl, investedTotal),
    equity: round2((user?.availableCapital ?? 0) + currentValueTotal),
    positions: enriched,
  };
}

/** @param {string} userId @param {number} [limit] @returns {Promise<object[]>} */
export async function getRecentTrades(userId, limit = 50) {
  const trades = await Trade.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return trades.map((t) => ({
    id: String(t._id),
    broker: t.broker,
    mode: t.mode,
    symbol: t.symbol,
    action: t.action,
    quantity: t.quantity,
    price: t.price,
    investmentAmount: t.investmentAmount,
    status: t.status,
    pnl: t.pnl,
    pnlPercent: t.pnlPercent,
    tradeSource: t.tradeSource,
    triggerReason: t.triggerReason,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  }));
}

/** @param {string} userId @returns {Promise<{time:Date, equity:number}[]>} daily equity curve from closed-trade P&L */
export async function getEquityCurve(userId) {
  const user = await User.findById(userId).lean();
  const closedTrades = await Trade.find({ userId, status: 'CLOSED' }).sort({ closedAt: 1 }).lean();
  let equity = user?.startingCapital ?? 100000;
  const curve = [{ time: user?.createdAt ?? new Date(), equity }];
  for (const t of closedTrades) {
    equity = round2(equity + (t.pnl || 0));
    curve.push({ time: t.closedAt, equity });
  }
  return curve;
}

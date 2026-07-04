import { Position } from '../models/Position.js';
import { Trade } from '../models/Trade.js';
import { User } from '../models/User.js';
import { UserSettings } from '../models/UserSettings.js';
import { marketData } from './marketData/index.js';
import { brokerFor } from './brokers/registry.js';
import { effectiveMode } from './brokers/tradingModeService.js';
import { round2, percentOf } from '../utils/format.js';

/** @param {string} userId @returns {Promise<object>} */
export async function getPortfolio(userId) {
  const settings = await UserSettings.findOne({ userId }).lean();
  const activeBroker = settings?.activeBroker ?? 'paper';
  // effectiveMode() re-checks the full 5-layer gate (not just settings.tradingMode),
  // so this can never show "live" broker data unless the gate is actually satisfied.
  const mode = await effectiveMode(userId, settings);

  if (mode === 'live') {
    return getLivePortfolio(userId, activeBroker);
  }
  return getPaperPortfolio(userId);
}

/**
 * Real open positions + margin pulled live from the active broker. Deliberately
 * reads getPositions() (today's intraday MIS positions), NOT getHoldings() — every
 * order this app places uses an intraday product type, so a same-day position would
 * never show up in "holdings" (that's for settled/delivered demat stock, typically
 * T+1). Reading holdings here would make today's live trades invisible until
 * settlement even though they're open right now.
 * @param {string} userId @param {string} brokerName @returns {Promise<object>}
 */
async function getLivePortfolio(userId, brokerName) {
  const broker = brokerFor(brokerName, userId);
  const [holdings, margin] = await Promise.all([broker.getPositions(), broker.getMargin()]);
  const symbols = holdings.map((h) => h.symbol);
  const ltps = symbols.length ? await marketData.getLTPBatch(symbols) : {};

  const enriched = holdings.map((h) => {
    const ltp = ltps[h.symbol] ?? h.avgPrice;
    const investedAmount = round2(h.avgPrice * h.quantity);
    const currentValue = round2(ltp * h.quantity);
    const pnl = round2(currentValue - investedAmount);
    return {
      symbol: h.symbol,
      broker: brokerName,
      quantity: h.quantity,
      avgBuyPrice: h.avgPrice,
      ltp,
      investedAmount,
      currentValue,
      pnl,
      pnlPercent: percentOf(pnl, investedAmount),
      stopLoss: null,
      target: null,
      openedAt: null,
    };
  });

  const investedTotal = round2(enriched.reduce((s, p) => s + p.investedAmount, 0));
  const currentValueTotal = round2(enriched.reduce((s, p) => s + p.currentValue, 0));
  const unrealizedPnl = round2(currentValueTotal - investedTotal);
  const availableCapital = margin.available ?? 0;
  const equity = round2(availableCapital + currentValueTotal);

  return {
    broker: brokerName,
    availableCapital,
    startingCapital: equity, // no "starting capital" concept for a real broker account
    investedTotal,
    currentValueTotal,
    unrealizedPnl,
    unrealizedPnlPercent: percentOf(unrealizedPnl, investedTotal),
    equity,
    positions: enriched,
  };
}

/** The paper-trading ledger. @param {string} userId @returns {Promise<object>} */
async function getPaperPortfolio(userId) {
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
    broker: 'paper',
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

/**
 * Daily equity curve from closed-trade P&L, scoped to whichever broker/mode is
 * currently active — mixing paper and live trades into one curve (or reusing
 * the paper account's fictional starting capital as a live baseline) would be
 * actively misleading. Live mode has no real historical margin snapshots, so
 * its curve starts at 0 and tracks cumulative realized P&L rather than a true
 * account-equity history.
 * @param {string} userId @returns {Promise<{time:Date, equity:number}[]>}
 */
export async function getEquityCurve(userId) {
  const settings = await UserSettings.findOne({ userId }).lean();
  const activeBroker = settings?.activeBroker ?? 'paper';
  const mode = await effectiveMode(userId, settings);

  if (mode === 'live') {
    const closedTrades = await Trade.find({ userId, broker: activeBroker, mode: 'live', status: 'CLOSED' })
      .sort({ closedAt: 1 })
      .lean();
    let equity = 0;
    const curve = [{ time: closedTrades[0]?.closedAt ?? new Date(), equity }];
    for (const t of closedTrades) {
      equity = round2(equity + (t.pnl || 0));
      curve.push({ time: t.closedAt, equity });
    }
    return curve;
  }

  const user = await User.findById(userId).lean();
  const closedTrades = await Trade.find({ userId, broker: 'paper', status: 'CLOSED' }).sort({ closedAt: 1 }).lean();
  let equity = user?.startingCapital ?? 100000;
  const curve = [{ time: user?.createdAt ?? new Date(), equity }];
  for (const t of closedTrades) {
    equity = round2(equity + (t.pnl || 0));
    curve.push({ time: t.closedAt, equity });
  }
  return curve;
}

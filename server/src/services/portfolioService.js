/**
 * Portfolio service.
 *
 * Builds the live portfolio (summary + open positions priced against live
 * quotes) and an approximate equity curve from realized P&L. See CONTRACT §7.
 */

import { marketData } from './marketData/index.js';
import User from '../models/User.js';
import UserSettings from '../models/UserSettings.js';
import Position from '../models/Position.js';
import Trade from '../models/Trade.js';
import { mapPositionDoc } from './tradeService.js';
import { growwBroker, effectiveMode } from './brokers/index.js';

/**
 * @typedef {import('../types.js').PortfolioResponse} PortfolioResponse
 * @typedef {import('../types.js').PortfolioSummary} PortfolioSummary
 * @typedef {import('../types.js').Position} Position
 * @typedef {import('../types.js').StockQuote} StockQuote
 * @typedef {import('../types.js').EquityPoint} EquityPoint
 */

/**
 * Round a money value to 2 decimals.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Create an Error carrying a machine-readable `.code`.
 * @param {string} message
 * @param {string} code
 * @returns {Error}
 */
function codedError(message, code) {
  const err = new Error(message);
  // @ts-ignore - attach code for the global error handler.
  err.code = code;
  return err;
}

/**
 * Fetch live quotes for a list of symbols, keyed by symbol. Failures are
 * skipped (best-effort) so the portfolio still renders for the rest.
 * @param {string[]} symbols
 * @returns {Promise<Map<string, StockQuote>>}
 */
async function fetchQuotes(symbols) {
  /** @type {Map<string, StockQuote>} */
  const map = new Map();
  const results = await Promise.allSettled(symbols.map((s) => marketData.getQuote(s)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map.set(symbols[i], r.value);
  });
  return map;
}

/**
 * Build the full portfolio response for a user.
 * @param {string} userId
 * @returns {Promise<PortfolioResponse>}
 */
export async function getPortfolio(userId) {
  const settings = await UserSettings.findOne({ userId });
  if (effectiveMode(settings) === 'live') {
    return getLivePortfolio();
  }

  const user = await User.findById(userId);
  if (!user) throw codedError('User not found', 'NOT_FOUND');

  const positionDocs = await Position.find({ userId });
  const symbols = positionDocs.map((p) => p.symbol);
  const quotes = await fetchQuotes(symbols);

  /** @type {Position[]} */
  const positions = [];
  let investedValue = 0;
  let currentValue = 0;
  let unrealizedTotal = 0;
  let dayPnl = 0;

  for (const doc of positionDocs) {
    const quote = quotes.get(doc.symbol);
    if (!quote) continue; // skip positions we couldn't price this cycle

    const mapped = mapPositionDoc(doc, quote);
    positions.push(mapped);

    investedValue += mapped.investedAmount;
    currentValue += mapped.currentValue;
    unrealizedTotal += mapped.unrealizedPnl;
    dayPnl += (quote.price - quote.previousClose) * mapped.quantity;
  }

  const cashBalance = round2(user.cashBalance);
  const realizedPnl = round2(user.realizedPnl || 0);
  const initialCapital = user.initialCapital;

  investedValue = round2(investedValue);
  currentValue = round2(currentValue);
  const totalValue = round2(cashBalance + currentValue);
  const totalPnl = round2(realizedPnl + unrealizedTotal);
  const totalPnlPercent = initialCapital > 0 ? round2((totalPnl / initialCapital) * 100) : 0;
  dayPnl = round2(dayPnl);

  // dayPnl % is expressed against the start-of-day value of the open positions
  // (currentValue - dayPnl). Falls back to 0 when there is nothing at risk.
  const prevValue = currentValue - dayPnl;
  const dayPnlPercent = prevValue > 0 ? round2((dayPnl / prevValue) * 100) : 0;

  /** @type {PortfolioSummary} */
  const summary = {
    cashBalance,
    investedValue,
    currentValue,
    totalValue,
    totalPnl,
    totalPnlPercent,
    dayPnl,
    dayPnlPercent,
    realizedPnl,
  };

  return { summary, positions };
}

/**
 * Build the portfolio from the user's REAL Groww holdings (live mode).
 * Field names follow Groww's documented holdings payload — adjust the mapping if
 * your account returns different keys. Cash is reported as 0 (fetch the margins
 * endpoint separately if you want live buying-power surfaced).
 * @returns {Promise<PortfolioResponse>}
 */
async function getLivePortfolio() {
  const holdings = await growwBroker.getHoldings();

  /** @type {Position[]} */
  const positions = [];
  let investedValue = 0;
  let currentValue = 0;
  let unrealized = 0;

  for (const h of holdings) {
    const symbol = String(h.trading_symbol || h.symbol || '').toUpperCase();
    const quantity = Math.floor(Number(h.quantity) || 0);
    const avgBuyPrice = Number(h.average_price ?? h.avg_price ?? 0);
    if (!symbol || quantity < 1) continue;

    const currentPrice = Number(h.ltp ?? h.last_price ?? avgBuyPrice);
    const invested = round2(avgBuyPrice * quantity);
    const value = round2(currentPrice * quantity);
    const uPnl = round2(value - invested);

    positions.push({
      id: symbol,
      symbol,
      quantity,
      avgBuyPrice: round2(avgBuyPrice),
      currentPrice: round2(currentPrice),
      investedAmount: invested,
      currentValue: value,
      unrealizedPnl: uPnl,
      unrealizedPnlPercent: avgBuyPrice > 0 ? round2((currentPrice / avgBuyPrice - 1) * 100) : 0,
      highestPriceSeen: round2(Math.max(currentPrice, avgBuyPrice)),
      openedAt: new Date().toISOString(),
    });

    investedValue += invested;
    currentValue += value;
    unrealized += uPnl;
  }

  investedValue = round2(investedValue);
  currentValue = round2(currentValue);

  /** @type {PortfolioSummary} */
  const summary = {
    cashBalance: 0,
    investedValue,
    currentValue,
    totalValue: currentValue,
    totalPnl: round2(unrealized),
    totalPnlPercent: investedValue > 0 ? round2((unrealized / investedValue) * 100) : 0,
    dayPnl: 0,
    dayPnlPercent: 0,
    realizedPnl: 0,
  };

  return { summary, positions };
}

/**
 * Build an approximate equity curve over the last `days`.
 *
 * Approximation: start at `initialCapital`, fold each CLOSED trade's realized
 * pnl onto the running equity at the trade's `closedAt` date (within window),
 * then append the live `totalValue` as the final point. This yields a stepwise
 * realized-equity line plus today's mark-to-market endpoint — cheap and stable
 * without storing daily snapshots.
 *
 * @param {string} userId
 * @param {number} [days=30]
 * @returns {Promise<EquityPoint[]>}
 */
export async function getEquityCurve(userId, days = 30) {
  const user = await User.findById(userId);
  if (!user) throw codedError('User not found', 'NOT_FOUND');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // CLOSED trades that carry realized pnl, oldest first, within the window.
  const closedTrades = await Trade.find({
    userId,
    status: 'CLOSED',
    closedAt: { $gte: since },
    pnl: { $ne: null },
  }).sort({ closedAt: 1 });

  /** @type {EquityPoint[]} */
  const curve = [];

  let equity = user.initialCapital;
  curve.push({ date: since.toISOString(), value: round2(equity) });

  for (const t of closedTrades) {
    equity += t.pnl || 0;
    const closedAt = t.closedAt instanceof Date ? t.closedAt : new Date(t.closedAt);
    curve.push({ date: closedAt.toISOString(), value: round2(equity) });
  }

  // Final point: current live total value (mark-to-market endpoint).
  const { summary } = await getPortfolio(userId);
  curve.push({ date: new Date().toISOString(), value: round2(summary.totalValue) });

  return curve;
}

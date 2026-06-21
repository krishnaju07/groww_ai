/**
 * Trade execution service (paper trading).
 *
 * Executes BUY/SELL trades against live quotes with simulated slippage,
 * maintaining the User cash balance, open Positions and the Trade log.
 * See CONTRACT §7 and the slippage rule in §2.
 */

import { randomUUID } from 'node:crypto';
import { SLIPPAGE_MIN, SLIPPAGE_MAX, GROWW_ORDER } from '../config/constants.js';
import { env } from '../config/env.js';
import { marketData } from './marketData/index.js';
import { findUniverse } from './marketData/MarketDataProvider.js';
import { growwBroker, assertLiveAllowed, effectiveMode } from './brokers/index.js';
import User from '../models/User.js';
import UserSettings from '../models/UserSettings.js';
import Position from '../models/Position.js';
import Trade from '../models/Trade.js';

/**
 * @typedef {import('../types.js').Trade} Trade
 * @typedef {import('../types.js').Position} Position
 * @typedef {import('../types.js').StockQuote} StockQuote
 * @typedef {import('../types.js').TradeAction} TradeAction
 * @typedef {import('../types.js').TradeType} TradeType
 */

/**
 * Round a money/price value to 2 decimals.
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
 * Compute the slippage-adjusted fill price.
 * BUY fills higher, SELL fills lower; slip ∈ [SLIPPAGE_MIN, SLIPPAGE_MAX].
 * @param {number} price
 * @param {TradeAction} action
 * @returns {number}
 */
function applySlippage(price, action) {
  const slip = SLIPPAGE_MIN + Math.random() * (SLIPPAGE_MAX - SLIPPAGE_MIN);
  const filled = action === 'BUY' ? price * (1 + slip) : price * (1 - slip);
  return round2(filled);
}

/**
 * Map a Trade Mongoose document to the Trade DTO.
 * @param {*} doc
 * @returns {Trade}
 */
export function mapTradeDoc(doc) {
  /** @type {Trade} */
  const trade = {
    id: String(doc._id),
    symbol: doc.symbol,
    action: doc.action,
    quantity: doc.quantity,
    price: doc.price,
    investmentAmount: doc.investmentAmount,
    tradeType: doc.tradeType,
    status: doc.status,
    openedAt: (doc.openedAt instanceof Date ? doc.openedAt : new Date(doc.openedAt)).toISOString(),
  };
  if (doc.triggerReason != null) trade.triggerReason = doc.triggerReason;
  if (doc.mode != null) trade.mode = doc.mode;
  if (doc.brokerOrderId != null) trade.brokerOrderId = doc.brokerOrderId;
  if (doc.pnl != null) trade.pnl = doc.pnl;
  if (doc.pnlPercent != null) trade.pnlPercent = doc.pnlPercent;
  if (doc.closedAt != null) {
    trade.closedAt = (doc.closedAt instanceof Date ? doc.closedAt : new Date(doc.closedAt)).toISOString();
  }
  return trade;
}

/**
 * Map a Position Mongoose document + live quote to the Position DTO.
 * @param {*} doc
 * @param {StockQuote} quote
 * @returns {Position}
 */
export function mapPositionDoc(doc, quote) {
  const currentPrice = round2(quote.price);
  const currentValue = round2(currentPrice * doc.quantity);
  const investedAmount = round2(doc.investedAmount);
  const unrealizedPnl = round2(currentValue - investedAmount);
  const unrealizedPnlPercent =
    doc.avgBuyPrice > 0 ? round2((currentPrice / doc.avgBuyPrice - 1) * 100) : 0;

  /** @type {Position} */
  return {
    id: String(doc._id),
    symbol: doc.symbol,
    quantity: doc.quantity,
    avgBuyPrice: round2(doc.avgBuyPrice),
    currentPrice,
    investedAmount,
    currentValue,
    unrealizedPnl,
    unrealizedPnlPercent,
    highestPriceSeen: round2(doc.highestPriceSeen),
    openedAt: (doc.openedAt instanceof Date ? doc.openedAt : new Date(doc.openedAt)).toISOString(),
  };
}

/**
 * Execute a trade (BUY or SELL). Routes to the LIVE Groww broker when the user
 * is in live mode AND the server is fully configured for it (brokers/index.js);
 * otherwise runs the paper engine. Caller signature is unchanged.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.symbol
 * @param {TradeAction} args.action
 * @param {number} [args.investmentAmount]   required for BUY
 * @param {number} [args.quantity]           optional explicit qty (live SELL)
 * @param {TradeType} args.tradeType
 * @param {string} [args.triggerReason]
 * @returns {Promise<Trade>}
 */
export async function executeTrade({ userId, symbol, action, investmentAmount, quantity, tradeType, triggerReason }) {
  const settings = await UserSettings.findOne({ userId });
  if (effectiveMode(settings) === 'live') {
    return executeLiveTrade({ userId, symbol, action, investmentAmount, quantity, tradeType, triggerReason });
  }

  const user = await User.findById(userId);
  if (!user) throw codedError('User not found', 'NOT_FOUND');

  const quote = await marketData.getQuote(symbol);
  const fillPrice = applySlippage(quote.price, action);

  if (action === 'BUY') {
    return buy({ user, symbol, fillPrice, investmentAmount, tradeType, triggerReason });
  }
  return sell({ user, symbol, fillPrice, tradeType, triggerReason });
}

/**
 * LIVE order via the Groww broker (REAL money). Reached only when live trading
 * is fully configured + enabled and the user is in live mode. Records a Trade
 * with mode:'live' + the broker order id; does NOT touch the paper cash balance
 * or paper Position collection — live holdings live on the Groww account.
 *
 * @param {{ userId:string, symbol:string, action:TradeAction, investmentAmount?:number, quantity?:number, tradeType:TradeType, triggerReason?:string }} args
 * @returns {Promise<Trade>}
 */
async function executeLiveTrade({ userId, symbol, action, investmentAmount, quantity, tradeType, triggerReason }) {
  assertLiveAllowed();
  if (tradeType === 'automatic' && env.ENABLE_LIVE_AUTO_TRADING !== true) {
    throw codedError('Automatic AI trading is disabled in live mode for safety', 'LIVE_AUTO_DISABLED');
  }

  const u = findUniverse(symbol);
  const quote = await marketData.getQuote(symbol);

  let qty = Math.floor(Number(quantity) || 0);
  if (action === 'BUY') {
    qty = Math.floor(Number(investmentAmount) / quote.price);
    if (!Number.isFinite(qty) || qty < 1) {
      throw codedError('Investment amount too small to buy a single share', 'INSUFFICIENT_AMOUNT');
    }
  } else if (qty < 1) {
    // SELL the full live holding when no explicit quantity was provided.
    const holdings = await growwBroker.getHoldings();
    const held = holdings.find(
      (h) => String(h.trading_symbol || h.symbol || '').toUpperCase() === u.gtsym.toUpperCase(),
    );
    qty = Math.floor(Number(held?.quantity) || 0);
    if (qty < 1) throw codedError('No live holding quantity to sell for this symbol', 'NO_POSITION');
  }

  const payload = await growwBroker.placeOrder({
    tradingSymbol: u.gtsym,
    exchange: u.gexch,
    segment: u.gseg,
    quantity: qty,
    transactionType: action,
    orderType: GROWW_ORDER.orderType,
    product: GROWW_ORDER.product,
    validity: GROWW_ORDER.validity,
    referenceId: makeReferenceId(),
  });

  const now = new Date();
  const tradeDoc = await Trade.create({
    userId,
    symbol: u.symbol,
    action,
    quantity: qty,
    price: round2(quote.price),
    investmentAmount: round2(qty * quote.price),
    tradeType,
    triggerReason: triggerReason || `Live ${action} via Groww (order ${payload.groww_order_id})`,
    status: 'OPEN',
    mode: 'live',
    brokerOrderId: payload.groww_order_id,
    openedAt: now,
  });
  return mapTradeDoc(tradeDoc);
}

/**
 * Generate a Groww-compliant order_reference_id (8–20 alphanumerics, ≤2 hyphens).
 * @returns {string}
 */
function makeReferenceId() {
  return `GA${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * BUY: floor qty from the investment amount, check funds, upsert the position
 * and log an OPEN trade.
 * @param {{ user:*, symbol:string, fillPrice:number, investmentAmount:number|undefined, tradeType:TradeType, triggerReason:string|undefined }} args
 * @returns {Promise<Trade>}
 */
async function buy({ user, symbol, fillPrice, investmentAmount, tradeType, triggerReason }) {
  const amount = Number(investmentAmount);
  const quantity = Math.floor(amount / fillPrice);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw codedError('Investment amount too small to buy a single share', 'INSUFFICIENT_AMOUNT');
  }

  const cost = round2(quantity * fillPrice);
  if (user.cashBalance < cost) {
    throw codedError('Insufficient cash balance for this trade', 'INSUFFICIENT_FUNDS');
  }

  const now = new Date();

  // Decrement cash (never negative; rounded at write).
  user.cashBalance = round2(user.cashBalance - cost);
  await user.save();

  // Upsert position: average up if one already exists.
  let position = await Position.findOne({ userId: user._id, symbol });
  if (position) {
    const newQty = position.quantity + quantity;
    const newInvested = round2(position.investedAmount + cost);
    position.quantity = newQty;
    position.investedAmount = newInvested;
    position.avgBuyPrice = round2(newInvested / newQty);
    position.highestPriceSeen = round2(Math.max(position.highestPriceSeen, fillPrice));
    await position.save();
  } else {
    position = await Position.create({
      userId: user._id,
      symbol,
      quantity,
      avgBuyPrice: fillPrice,
      investedAmount: cost,
      highestPriceSeen: fillPrice,
      openedAt: now,
    });
  }

  const tradeDoc = await Trade.create({
    userId: user._id,
    symbol,
    action: 'BUY',
    quantity,
    price: fillPrice,
    investmentAmount: cost,
    tradeType,
    triggerReason,
    status: 'OPEN',
    openedAt: now,
  });

  return mapTradeDoc(tradeDoc);
}

/**
 * SELL: close the ENTIRE open position, realize pnl, credit cash + realizedPnl,
 * mark the originating OPEN buy CLOSED, and log a SELL trade.
 * @param {{ user:*, symbol:string, fillPrice:number, tradeType:TradeType, triggerReason:string|undefined }} args
 * @returns {Promise<Trade>}
 */
async function sell({ user, symbol, fillPrice, tradeType, triggerReason }) {
  const position = await Position.findOne({ userId: user._id, symbol });
  if (!position) {
    throw codedError('No open position to sell for this symbol', 'NO_POSITION');
  }

  const quantity = position.quantity;
  const avgBuyPrice = position.avgBuyPrice;
  const proceeds = round2(quantity * fillPrice);
  const pnl = round2((fillPrice - avgBuyPrice) * quantity);
  const pnlPercent = avgBuyPrice > 0 ? round2((fillPrice / avgBuyPrice - 1) * 100) : 0;
  const now = new Date();

  // Credit cash and accumulate realized pnl.
  user.cashBalance = round2(user.cashBalance + proceeds);
  user.realizedPnl = round2((user.realizedPnl || 0) + pnl);
  await user.save();

  // Attribute the realized pnl to the latest OPEN buy, then close ALL remaining
  // OPEN buy trades for this symbol. An averaged-up position has several OPEN
  // buys; since the whole position is closed here, none should survive as a
  // phantom OPEN buy in the trade log.
  const originatingBuy = await Trade.findOne({
    userId: user._id,
    symbol,
    action: 'BUY',
    status: 'OPEN',
  }).sort({ createdAt: -1 });
  if (originatingBuy) {
    originatingBuy.status = 'CLOSED';
    originatingBuy.pnl = pnl;
    originatingBuy.pnlPercent = pnlPercent;
    originatingBuy.closedAt = now;
    await originatingBuy.save();
  }
  await Trade.updateMany(
    { userId: user._id, symbol, action: 'BUY', status: 'OPEN' },
    { $set: { status: 'CLOSED', closedAt: now } },
  );

  // Remove the now-closed position.
  await Position.deleteOne({ _id: position._id });

  const sellDoc = await Trade.create({
    userId: user._id,
    symbol,
    action: 'SELL',
    quantity,
    price: fillPrice,
    investmentAmount: proceeds,
    tradeType,
    triggerReason,
    status: 'CLOSED',
    pnl,
    pnlPercent,
    openedAt: now,
    closedAt: now,
  });

  return mapTradeDoc(sellDoc);
}

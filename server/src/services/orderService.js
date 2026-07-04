/**
 * The SOLE choke point through which every order — paper or live, manual,
 * automatic (cron), or AI-triggered — must flow. Routes, the AI decision engine,
 * and the auto-trading cron all call `placeOrder` here; nothing else is allowed
 * to call a broker adapter's placeOrder directly. This is what makes the risk
 * gate and the live-trading safety gate structurally unbypassable.
 */
import { UserSettings } from '../models/UserSettings.js';
import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { marketData } from './marketData/index.js';
import { canTrade } from './risk/riskManager.js';
import { effectiveMode, assertLiveAllowed } from './brokers/tradingModeService.js';
import { brokerFor } from './brokers/registry.js';
import { getSystemConfig } from './config/systemConfig.js';
import { generateIdempotencyKey } from '../utils/idempotency.js';
import { applyBuyToPosition, applySellToPosition } from '../utils/positionLedger.js';
import { getIntradaySessionContext } from '../utils/marketHours.js';
import { round2 } from '../utils/format.js';

/**
 * PaperBroker keeps its own Trade/Position bookkeeping internally (it has no
 * separate real broker to defer to). Real broker adapters don't — so a live
 * fill has to be recorded here, the one place every order (any broker) passes
 * through. Without this, the risk manager's daily trade-count/loss-limit
 * checks (which read the Trade collection) would never see live trades, and
 * "Recent Trades"/the equity curve would silently only ever show paper activity.
 * Only handles orders the broker reports as immediately FILLED with a known
 * price (true for MARKET orders on NSE cash equity in practice) — a LIMIT
 * order left PLACED/PENDING isn't recorded yet since there's no fill price;
 * that would need order-status polling/webhooks to backfill later.
 * @param {string} userId @param {string} brokerName
 * @param {{symbol:string, action:'BUY'|'SELL', quantity:number, stopLoss?:number, target?:number, source:string, triggerReason?:string, aiDecisionId?:string}} input
 * @param {{status:string, filledPrice?:number, filledQuantity?:number}} result
 */
async function recordLiveFill(userId, brokerName, input, result) {
  if (result.status !== 'FILLED' || !result.filledPrice) return;

  const price = result.filledPrice;
  const quantity = result.filledQuantity || input.quantity;

  if (input.action === 'BUY') {
    const investmentAmount = round2(price * quantity);
    await Trade.create({
      userId,
      broker: brokerName,
      mode: 'live',
      symbol: input.symbol,
      action: 'BUY',
      quantity,
      price,
      investmentAmount,
      tradeSource: input.source,
      triggerReason: input.triggerReason ?? '',
      status: 'OPEN',
      aiDecisionId: input.aiDecisionId ?? null,
    });

    await applyBuyToPosition({
      userId,
      broker: brokerName,
      symbol: input.symbol,
      quantity,
      investmentAmount,
      price,
      stopLoss: input.stopLoss,
      target: input.target,
      aiDecisionId: input.aiDecisionId,
    });
    return;
  }

  // SELL — the real broker sell already succeeded before this bookkeeping runs, so a
  // missing/insufficient local Position record (e.g. an externally-opened position, or
  // one opened before live-fill recording existed) must not block recording the trade;
  // fall back to pnl=0 rather than throwing, since we have no cost basis to compute it.
  const proceeds = round2(price * quantity);
  let costBasis = proceeds;
  try {
    ({ costBasis } = await applySellToPosition({ userId, broker: brokerName, symbol: input.symbol, quantity }));
  } catch (err) {
    if (err.code !== 'NO_POSITION') throw err;
    console.warn(`[orderService] recordLiveFill SELL: no tracked ${brokerName} position for ${input.symbol} — recording pnl=0.`);
  }
  const pnl = round2(proceeds - costBasis);

  await Trade.create({
    userId,
    broker: brokerName,
    mode: 'live',
    symbol: input.symbol,
    action: 'SELL',
    quantity,
    price,
    investmentAmount: proceeds,
    tradeSource: input.source,
    triggerReason: input.triggerReason ?? '',
    status: 'CLOSED',
    pnl,
    pnlPercent: costBasis ? round2((pnl / costBasis) * 100) : 0,
    aiDecisionId: input.aiDecisionId ?? null,
    closedAt: new Date(),
  });
}

function codedError(message, code, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

/**
 * Wraps Order.create so a genuine duplicate-submit (same userId/symbol/action/quantity
 * within the same second — see idempotency.js) surfaces as a clean, expected error
 * instead of a raw MongoDB E11000 bubbling up as a 500.
 */
async function createOrder(doc) {
  try {
    return await Order.create(doc);
  } catch (err) {
    if (err.code === 11000) {
      throw codedError(
        'Duplicate order — an identical order (same symbol/action/quantity) was already submitted in the last second.',
        'DUPLICATE_ORDER',
        409,
      );
    }
    throw err;
  }
}

/**
 * @param {string} userId
 * @param {{symbol:string, action:'BUY'|'SELL', quantity:number, orderType?:'MARKET'|'LIMIT',
 *   price?:number, stopLoss?:number, target?:number, source?:'manual'|'automatic'|'ai',
 *   triggerReason?:string, aiDecisionId?:string, confirmRealMoney?:boolean}} input
 * @returns {Promise<{orderId:string, brokerOrderId:string, status:string, broker:string, mode:string, filledPrice?:number, filledQuantity?:number}>}
 */
export async function placeOrder(userId, input) {
  const source = input.source ?? 'manual';
  const settings = await UserSettings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  );

  const mode = await effectiveMode(userId, settings);
  const brokerName = mode === 'live' ? settings.activeBroker : 'paper';
  const systemConfig = await getSystemConfig(userId);

  // This platform's entire premise is intraday-only, no overnight positions. NSE cash
  // technically stays open until 15:30 IST, but squareOffJob's daily force-close cutoff
  // is 15:15 — a fresh BUY placed in that trailing 15-minute window (or any time after,
  // however that happened) would have zero mechanism left to close it same-day. This is
  // the one gate on the choke point itself, so it applies to every order regardless of
  // source (manual/automatic/ai) or broker (paper/live) — not just an AI-prompt
  // suggestion. Respects the same ignoreMarketHours escape hatch as isMarketOpen() so
  // dev/testing outside market hours still works.
  if (input.action === 'BUY' && !systemConfig.ignoreMarketHours) {
    const { sessionPhase } = getIntradaySessionContext();
    if (sessionPhase === 'after-square-off') {
      throw codedError(
        "Today's intraday square-off has already run — no new positions can be opened this late (nothing left to close it same-day).",
        'INTRADAY_ENTRY_WINDOW_CLOSED',
        403,
      );
    }
  }

  const estimatedPrice = input.price ?? (await marketData.getLTP(input.symbol));

  if (mode === 'live') {
    await assertLiveAllowed(userId, brokerName);

    if (source === 'automatic') {
      if (!systemConfig.enableLiveAutoTrading) {
        throw codedError(
          'Unattended live auto-trading is disabled (turn it on from Settings).',
          'LIVE_AUTO_TRADING_DISABLED',
          403,
        );
      }
    } else if (!input.confirmRealMoney) {
      throw codedError('This is a REAL MONEY order — client confirmation is required.', 'REAL_MONEY_CONFIRM_REQUIRED', 400);
    }

    const estimatedValue = round2(estimatedPrice * input.quantity);
    if (estimatedValue > systemConfig.liveMaxOrderValue) {
      throw codedError(
        `Live order value ₹${estimatedValue} exceeds the configured cap ₹${systemConfig.liveMaxOrderValue}.`,
        'LIVE_ORDER_VALUE_EXCEEDED',
        403,
      );
    }
  }

  const riskResult = await canTrade(userId, {
    symbol: input.symbol,
    action: input.action,
    quantity: input.quantity,
    estimatedPrice,
    stopLoss: input.stopLoss,
  });

  const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey({ userId, symbol: input.symbol, action: input.action, quantity: input.quantity });

  if (!riskResult.allowed) {
    try {
      await createOrder({
        userId,
        broker: brokerName,
        mode,
        symbol: input.symbol,
        action: input.action,
        orderType: input.orderType ?? 'MARKET',
        quantity: input.quantity,
        price: input.price ?? null,
        status: 'REJECTED',
        idempotencyKey,
        source,
        confirmedRealMoney: Boolean(input.confirmRealMoney),
        rejectReason: riskResult.reason,
      });
    } catch (err) {
      if (err.code !== 'DUPLICATE_ORDER') throw err;
      // Already logged this exact rejected attempt a moment ago — fine, the risk-blocked
      // reason below is what the caller actually needs to see either way.
    }
    throw codedError(riskResult.reason, 'RISK_BLOCKED', 403);
  }

  const orderDoc = await createOrder({
    userId,
    broker: brokerName,
    mode,
    symbol: input.symbol,
    action: input.action,
    orderType: input.orderType ?? 'MARKET',
    quantity: input.quantity,
    price: input.price ?? null,
    status: 'PLACED',
    idempotencyKey,
    source,
    confirmedRealMoney: Boolean(input.confirmRealMoney),
  });

  try {
    const broker = brokerFor(brokerName, userId);
    const result = await broker.placeOrder({
      symbol: input.symbol,
      action: input.action,
      quantity: input.quantity,
      orderType: input.orderType ?? 'MARKET',
      price: input.price,
      stopLoss: input.stopLoss,
      target: input.target,
      source,
      triggerReason: input.triggerReason,
      aiDecisionId: input.aiDecisionId,
    });

    orderDoc.brokerOrderId = result.brokerOrderId;
    orderDoc.status = result.status;
    await orderDoc.save();

    if (mode === 'live') {
      try {
        await recordLiveFill(userId, brokerName, input, result);
      } catch (err) {
        // Never let bookkeeping failure hide a real broker fill from the caller —
        // the order already went through; log loudly and move on.
        console.error(`[orderService] recordLiveFill failed for order ${orderDoc._id}:`, err);
      }
    }

    return {
      orderId: String(orderDoc._id),
      brokerOrderId: result.brokerOrderId,
      status: result.status,
      broker: brokerName,
      mode,
      filledPrice: result.filledPrice,
      filledQuantity: result.filledQuantity,
    };
  } catch (err) {
    orderDoc.status = 'REJECTED';
    orderDoc.rejectReason = err.message;
    await orderDoc.save();
    throw err;
  }
}

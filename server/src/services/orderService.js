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
import { Position } from '../models/Position.js';
import { marketData } from './marketData/index.js';
import { canTrade } from './risk/riskManager.js';
import { effectiveMode, assertLiveAllowed } from './brokers/tradingModeService.js';
import { brokerFor } from './brokers/registry.js';
import { getSystemConfig } from './config/systemConfig.js';
import { getInstrument } from './instruments/instrumentService.js';
import { critiqueClosedTrade } from './ai/tradeCritiqueService.js';
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
 * price. Exported (not just called inline) because orderReconciliationJob.js
 * reuses this exact logic to backfill a fill that raced the broker's order-status
 * lookup at placement time — the caller (either placeOrder or the reconciliation
 * job) is responsible for guarding against calling this twice for the same order
 * (see Order.tradeId — set once a fill is recorded, checked before calling again).
 * @param {string} userId @param {string} brokerName
 * @param {{symbol:string, action:'BUY'|'SELL', quantity:number, stopLoss?:number, target?:number, source:string,
 *   triggerReason?:string, aiDecisionId?:string, segment?:string, underlying?:string|null, strike?:number|null,
 *   expiry?:Date|null, optionType?:string|null, lotSize?:number|null}} input
 * @param {{status:string, filledPrice?:number, filledQuantity?:number}} result
 * @returns {Promise<import('mongoose').Types.ObjectId|null>} the created Trade's _id, or null if not actually filled
 */
export async function recordLiveFill(userId, brokerName, input, result) {
  if (result.status !== 'FILLED' || !result.filledPrice) return null;

  const price = result.filledPrice;
  const quantity = result.filledQuantity || input.quantity;
  const optionFields = {
    segment: input.segment ?? 'CASH',
    underlying: input.underlying ?? null,
    strike: input.strike ?? null,
    expiry: input.expiry ?? null,
    optionType: input.optionType ?? null,
    lotSize: input.lotSize ?? null,
  };

  if (input.action === 'BUY') {
    // Position mutation happens first, Trade.create last — if this whole function gets
    // called twice for the same physical fill (e.g. reconciliation retrying after a
    // partial failure), neither ordering is perfectly idempotent without a real
    // transaction, but keeping the simple single-document Trade.create as the final
    // "commit point" — the thing tradeId is keyed off — shrinks the failure window to
    // just that one write, rather than leaving an orphaned Trade with no position update.
    const investmentAmount = round2(price * quantity);
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
      strategy: input.strategy,
      strategyGroupId: input.strategyGroupId,
      ...optionFields,
    });

    const trade = await Trade.create({
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
      ...optionFields,
    });
    return trade._id;
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

  const trade = await Trade.create({
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
    ...optionFields,
  });
  // Self-critique + learned-edge cache refresh (non-blocking, never fails the fill).
  critiqueClosedTrade(trade).catch(() => {});
  return trade._id;
}

/**
 * After a live BUY fill, places a broker-side protective OCO (target+stop-loss) as a safety
 * net alongside positionGuardianJob's own 15s polling — the broker enforces the exit even
 * if this server is down or slow. Only Groww implements this (feature-detected via
 * `placeProtectiveOco`), and only fires when the position doesn't already carry one — a
 * position built from several same-day BUYs only gets protected at first-entry quantity,
 * a known MVP limitation. A failure here never fails the trade itself: the fill already
 * happened either way, and positionGuardianJob remains the primary enforcement mechanism.
 * @param {string} userId @param {string} brokerName @param {import('../types.js').BrokerAdapter} broker @param {string} symbol
 */
async function attachProtectiveOco(userId, brokerName, broker, symbol) {
  if (typeof broker.placeProtectiveOco !== 'function') return;
  const position = await Position.findOne({ userId, broker: brokerName, symbol });
  if (!position || position.smartOrderId || !position.stopLoss || !position.target) return;
  try {
    const smartOrder = await broker.placeProtectiveOco({
      symbol,
      quantity: position.quantity,
      stopLoss: position.stopLoss,
      target: position.target,
      segment: position.segment ?? 'CASH',
    });
    position.smartOrderId = smartOrder.smartOrderId;
    position.smartOrderType = smartOrder.smartOrderType ?? 'OCO';
    await position.save();
  } catch (err) {
    console.error(`[orderService] failed to place protective OCO for ${symbol}:`, err.message);
  }
}

/**
 * Cancels a still-active broker-side OCO tied to a position that's being (or was just)
 * sold down — without this, a stale trigger could still fire against shares we no longer
 * (fully) hold. `smartOrderId` must be captured by the caller BEFORE the sell mutates/
 * deletes the Position doc (positionLedger deletes it once quantity hits 0).
 * @param {import('../types.js').BrokerAdapter} broker @param {string|null} smartOrderId @param {string|null} smartOrderType @param {string} symbol
 */
async function releaseProtectiveOco(broker, smartOrderId, smartOrderType, symbol, segment = 'CASH') {
  if (!smartOrderId || typeof broker.cancelSmartOrder !== 'function') return;
  try {
    await broker.cancelSmartOrder(smartOrderId, smartOrderType, segment);
  } catch (err) {
    console.error(`[orderService] failed to cancel protective OCO ${smartOrderId} for ${symbol}:`, err.message);
  }
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
 *   triggerReason?:string, aiDecisionId?:string, confirmRealMoney?:boolean, segment?:'CASH'|'FNO'}} input
 * @returns {Promise<{orderId:string, brokerOrderId:string, status:string, broker:string, mode:string, filledPrice?:number, filledQuantity?:number}>}
 */
export async function placeOrder(userId, input) {
  const source = input.source ?? 'manual';
  const segment = input.segment ?? 'CASH';
  const settings = await UserSettings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  );

  const mode = await effectiveMode(userId, settings);
  const brokerName = mode === 'live' ? settings.activeBroker : 'paper';
  const systemConfig = await getSystemConfig(userId);

  // FNO's strike/expiry/optionType/lotSize always come from the synced Instrument
  // record, never trusted from the caller (client or AI) — same "never trust a
  // client-supplied risk decision" principle riskManager applies to sizing. Lot size
  // in particular gates the quantity validation just below.
  let instrument = null;
  if (segment === 'FNO') {
    instrument = await getInstrument(input.symbol);
    if (!instrument) {
      throw codedError(
        `Unknown option contract '${input.symbol}' — instrument data may not be synced yet.`,
        'UNKNOWN_INSTRUMENT',
        400,
      );
    }
    if (!instrument.lotSize || input.quantity % instrument.lotSize !== 0) {
      throw codedError(
        `Quantity ${input.quantity} must be a multiple of the lot size (${instrument.lotSize}) for ${input.symbol}.`,
        'INVALID_LOT_SIZE',
        400,
      );
    }
  }
  const optionFields = instrument
    ? {
        segment: 'FNO',
        underlying: instrument.underlyingSymbol,
        strike: instrument.strikePrice,
        expiry: instrument.expiryDate,
        optionType: instrument.optionType,
        lotSize: instrument.lotSize,
      }
    : { segment: 'CASH', underlying: null, strike: null, expiry: null, optionType: null, lotSize: null };

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

  const estimatedPrice = input.price ?? (await marketData.getLTP(input.symbol, segment));

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

  const riskResult = await canTrade(userId, mode, {
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
        ...optionFields,
        action: input.action,
        orderType: input.orderType ?? 'MARKET',
        quantity: input.quantity,
        price: input.price ?? null,
        status: 'REJECTED',
        idempotencyKey,
        source,
        confirmedRealMoney: Boolean(input.confirmRealMoney),
        rejectReason: riskResult.reason,
        triggerReason: input.triggerReason ?? '',
        aiDecisionId: input.aiDecisionId ?? null,
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
    ...optionFields,
    action: input.action,
    orderType: input.orderType ?? 'MARKET',
    quantity: input.quantity,
    price: input.price ?? null,
    status: 'PLACED',
    idempotencyKey,
    source,
    confirmedRealMoney: Boolean(input.confirmRealMoney),
    triggerReason: input.triggerReason ?? '',
    aiDecisionId: input.aiDecisionId ?? null,
  });

  try {
    const broker = brokerFor(brokerName, userId);

    // Snapshot any existing protective OCO BEFORE the sell fires — recordLiveFill's
    // position bookkeeping below deletes the Position doc once quantity hits 0, so this
    // is the last point smartOrderId is readable for a full close.
    let preSellSmartOrder = null;
    if (mode === 'live' && input.action === 'SELL') {
      const existing = await Position.findOne({ userId, broker: brokerName, symbol: input.symbol }).lean();
      if (existing?.smartOrderId) preSellSmartOrder = { id: existing.smartOrderId, type: existing.smartOrderType, segment: existing.segment ?? 'CASH' };
    }

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
      strategy: input.strategy,
      strategyGroupId: input.strategyGroupId,
      ...optionFields,
    });

    orderDoc.brokerOrderId = result.brokerOrderId;
    orderDoc.status = result.status;
    await orderDoc.save();

    if (mode === 'live') {
      try {
        const tradeId = await recordLiveFill(userId, brokerName, { ...input, ...optionFields }, result);
        if (tradeId) {
          orderDoc.tradeId = tradeId;
          await orderDoc.save();
        }
        // If the broker hasn't reported FILLED yet (result.status is still PLACED/PENDING
        // — the getOrderStatus race the broker adapters retry internally, but can still
        // miss), tradeId stays null and orderReconciliationJob.js picks this order up on
        // its next pass to re-check and backfill the fill once it actually lands.

        if (input.action === 'BUY') {
          await attachProtectiveOco(userId, brokerName, broker, input.symbol);
        } else if (preSellSmartOrder) {
          await releaseProtectiveOco(broker, preSellSmartOrder.id, preSellSmartOrder.type, input.symbol, preSellSmartOrder.segment);
        }
      } catch (err) {
        // Never let bookkeeping failure hide a real broker fill from the caller —
        // the order already went through; log loudly and move on. Reconciliation will
        // retry this too, since tradeId never got set.
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

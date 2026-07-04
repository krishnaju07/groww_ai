/**
 * The SOLE choke point through which every order — paper or live, manual,
 * automatic (cron), or AI-triggered — must flow. Routes, the AI decision engine,
 * and the auto-trading cron all call `placeOrder` here; nothing else is allowed
 * to call a broker adapter's placeOrder directly. This is what makes the risk
 * gate and the live-trading safety gate structurally unbypassable.
 */
import { env } from '../config/env.js';
import { UserSettings } from '../models/UserSettings.js';
import { Order } from '../models/Order.js';
import { marketData } from './marketData/index.js';
import { canTrade } from './risk/riskManager.js';
import { effectiveMode, assertLiveAllowed } from './brokers/tradingModeService.js';
import { brokerFor } from './brokers/registry.js';
import { generateIdempotencyKey } from '../utils/idempotency.js';
import { round2 } from '../utils/format.js';

function codedError(message, code, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
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

  const estimatedPrice = input.price ?? (await marketData.getLTP(input.symbol));

  if (mode === 'live') {
    await assertLiveAllowed(userId, brokerName);

    if (source === 'automatic') {
      if (!env.ENABLE_LIVE_AUTO_TRADING) {
        throw codedError(
          'Unattended live auto-trading is disabled (set ENABLE_LIVE_AUTO_TRADING=true to allow it).',
          'LIVE_AUTO_TRADING_DISABLED',
          403,
        );
      }
    } else if (!input.confirmRealMoney) {
      throw codedError('This is a REAL MONEY order — client confirmation is required.', 'REAL_MONEY_CONFIRM_REQUIRED', 400);
    }

    const estimatedValue = round2(estimatedPrice * input.quantity);
    if (estimatedValue > env.LIVE_MAX_ORDER_VALUE) {
      throw codedError(
        `Live order value ₹${estimatedValue} exceeds the configured cap ₹${env.LIVE_MAX_ORDER_VALUE}.`,
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
    await Order.create({
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
    throw codedError(riskResult.reason, 'RISK_BLOCKED', 403);
  }

  const orderDoc = await Order.create({
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

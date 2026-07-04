/**
 * The unattended tick: quant-only (no Claude call — cheap enough to run every 30s),
 * respects UserSettings.autoInvest/autoExit, routes every trade through
 * riskManager.canTrade() via orderService.placeOrder() — the same choke point
 * manual and AI-triggered orders use.
 */
import { DEFAULT_USER_ID, STOCK_UNIVERSE } from '../../config/constants.js';
import { UserSettings } from '../../models/UserSettings.js';
import { Position } from '../../models/Position.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { buildContext } from './contextBuilder.js';
import { scoreQuant } from './aiSignalService.js';
import { placeOrder } from '../orderService.js';
import { isMarketOpen } from '../../utils/marketHours.js';
import { env } from '../../config/env.js';

/** @returns {Promise<{ran:boolean, reason?:string, results?:object[]}>} */
export async function runAutoTradingTick(userId = DEFAULT_USER_ID) {
  if (!env.AUTO_TRADING_ENABLED) return { ran: false, reason: 'AUTO_TRADING_ENABLED=false' };
  if (!isMarketOpen()) return { ran: false, reason: 'market closed' };

  const settings = await UserSettings.findOne({ userId }).lean();
  if (!settings?.autoInvest?.enabled) return { ran: false, reason: 'autoInvest disabled' };

  const openPositions = await Position.find({ userId, broker: 'paper' }).lean();
  const openSymbols = new Set(openPositions.map((p) => p.symbol));
  const results = [];

  for (const { symbol } of STOCK_UNIVERSE) {
    try {
      const ctx = await buildContext(symbol);
      const decision = scoreQuant(symbol, ctx, settings.autoInvest.amountPerTrade);

      if (decision.action === 'WAIT') continue;
      if (decision.action === 'BUY' && openSymbols.has(symbol)) continue;
      if (decision.action === 'BUY' && openPositions.length >= settings.autoInvest.maxOpenPositions) continue;
      if (decision.action === 'SELL' && !openSymbols.has(symbol)) continue;

      const log = await AIDecisionLog.create({
        userId,
        symbol,
        action: decision.action,
        quantity: decision.quantity,
        stopLoss: decision.stopLoss,
        target: decision.target,
        reason: decision.reason,
        confidence: decision.confidence,
        models: [{ name: 'Quant', action: decision.action, confidence: decision.confidence }],
        indicatorsSnapshot: ctx,
      });

      try {
        const order = await placeOrder(userId, {
          symbol,
          action: decision.action,
          quantity: decision.quantity,
          stopLoss: decision.stopLoss,
          target: decision.target,
          source: 'automatic',
          triggerReason: decision.reason,
          aiDecisionId: log._id,
        });
        log.resultingOrderId = order.orderId;
        log.riskResult = { allowed: true, reason: '' };
        await log.save();
        results.push({ symbol, action: decision.action, status: order.status });
      } catch (err) {
        log.riskResult = { allowed: false, reason: err.message };
        await log.save();
        results.push({ symbol, action: decision.action, status: 'BLOCKED', reason: err.message });
      }
    } catch (err) {
      console.error(`[autoTradingService] tick failed for ${symbol}:`, err.message);
    }
  }

  return { ran: true, results };
}

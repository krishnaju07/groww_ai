/**
 * The unattended tick. Quant screens every symbol every 30s (cheap, no external
 * call). When UserSettings.autoInvest.requireAiConfirmation is on (default),
 * an actionable quant BUY/SELL is additionally confirmed by the configured LLM
 * (aiProvider) before an order is placed — a trade only auto-fires if BOTH
 * models agree on direction. This bounds LLM cost/rate-limit exposure to only
 * the symbols quant already flagged, plus a per-symbol cooldown so a signal
 * that holds across several ticks doesn't re-trigger a fresh LLM call every time.
 * Every order still routes through riskManager.canTrade() via orderService.placeOrder()
 * — the same choke point manual and AI-triggered orders use.
 */
import { DEFAULT_USER_ID, STOCK_UNIVERSE } from '../../config/constants.js';
import { UserSettings } from '../../models/UserSettings.js';
import { Position } from '../../models/Position.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { buildContext } from './contextBuilder.js';
import { scoreQuant } from './aiSignalService.js';
import { callProvider } from './decisionEngine.js';
import { placeOrder } from '../orderService.js';
import { effectiveMode } from '../brokers/tradingModeService.js';
import { isMarketOpen } from '../../utils/marketHours.js';
import { getSystemConfig } from '../config/systemConfig.js';

const AI_CONFIRM_COOLDOWN_MS = 5 * 60 * 1000; // don't re-confirm the same symbol more than once per 5 min
const lastConfirmAttempt = new Map(); // symbol -> timestamp

/**
 * @param {string} userId @param {string} symbol @param {string} providerKey
 * @param {import('../../types.js').AiDecision} quantDecision
 * @param {import('../../types.js').IndicatorSnapshot} ctx
 * @returns {Promise<{agreed:boolean, log:object}>}
 */
async function confirmWithLlm(userId, symbol, providerKey, quantDecision, ctx) {
  let llm = null;
  let llmError = null;
  try {
    llm = await callProvider(providerKey, symbol, ctx);
  } catch (err) {
    llmError = err.message;
  }

  const agreed = Boolean(llm) && llm.action === quantDecision.action;
  const log = await AIDecisionLog.create({
    userId,
    symbol,
    action: agreed ? quantDecision.action : 'WAIT',
    quantity: agreed ? quantDecision.quantity : 0,
    stopLoss: agreed ? quantDecision.stopLoss : null,
    target: agreed ? quantDecision.target : null,
    reason: llm
      ? `Ensemble ${agreed ? 'agreed' : 'disagreed'}: Quant=${quantDecision.action} (${quantDecision.reason}); ${llm.providerLabel}=${llm.action} (${llm.reason})`
      : `LLM confirmation unavailable (${llmError}) — trade skipped, confirmation was required.`,
    confidence: agreed ? Math.round((quantDecision.confidence + llm.confidence) / 2) : 0,
    justification: llm?.justification ?? '',
    scoreBreakdown: llm?.scoreBreakdown ?? undefined,
    models: [
      { name: 'Quant', action: quantDecision.action, confidence: quantDecision.confidence },
      ...(llm ? [{ name: llm.providerLabel, action: llm.action, confidence: llm.confidence }] : []),
    ],
    indicatorsSnapshot: ctx,
  });

  return { agreed, log };
}

/** @returns {Promise<{ran:boolean, reason?:string, results?:object[]}>} */
export async function runAutoTradingTick(userId = DEFAULT_USER_ID) {
  const systemConfig = await getSystemConfig(userId);
  if (!systemConfig.autoTradingEnabled) return { ran: false, reason: 'auto-trading disabled in Settings' };
  if (!(await isMarketOpen(userId))) return { ran: false, reason: 'market closed' };

  const settings = await UserSettings.findOne({ userId }).lean();
  if (!settings?.autoInvest?.enabled) return { ran: false, reason: 'autoInvest disabled' };

  // Auto-trading follows whatever broker the user is effectively operating on right
  // now (paper, or their connected live broker) — checking paper positions while the
  // user trades live would blind this to real open exposure and could double-enter.
  const mode = await effectiveMode(userId, settings);
  const brokerName = mode === 'live' ? settings.activeBroker : 'paper';
  const openPositions = await Position.find({ userId, broker: brokerName }).lean();
  const openSymbols = new Set(openPositions.map((p) => p.symbol));
  // Mutable — refreshed as the loop places orders, so maxOpenPositions is actually
  // enforced across symbols within a single tick (the pre-loop snapshot above would
  // otherwise let every symbol in this tick pass the same stale count check).
  let openPositionCount = openPositions.length;
  const minConfidence = settings.autoInvest.minConfidence ?? 75;
  const results = [];

  for (const { symbol } of STOCK_UNIVERSE) {
    try {
      const ctx = await buildContext(symbol, userId);
      const quantDecision = scoreQuant(symbol, ctx, settings.autoInvest.amountPerTrade);

      if (quantDecision.action === 'WAIT') continue;
      // A fresh entry this late has little runway left before the day's forced
      // square-off — don't rely solely on the LLM prompt's guidance to skip these; the
      // quant-only path (requireAiConfirmation off) needs the same backstop. orderService
      // separately hard-blocks any BUY once sessionPhase is 'after-square-off' entirely.
      if (quantDecision.action === 'BUY' && ['closing', 'after-square-off'].includes(ctx.sessionPhase)) {
        results.push({ symbol, action: quantDecision.action, status: 'SKIPPED_TOO_CLOSE_TO_SQUAREOFF' });
        continue;
      }
      if (quantDecision.confidence < minConfidence) {
        results.push({ symbol, action: quantDecision.action, status: 'SKIPPED_LOW_CONFIDENCE', confidence: quantDecision.confidence });
        continue;
      }
      if (quantDecision.action === 'BUY' && openSymbols.has(symbol)) continue;
      if (quantDecision.action === 'BUY' && openPositionCount >= settings.autoInvest.maxOpenPositions) continue;
      if (quantDecision.action === 'SELL' && !openSymbols.has(symbol)) continue;

      let log;
      if (settings.autoInvest.requireAiConfirmation) {
        // Keyed by (symbol, action) — a disagreed BUY confirmation attempt must not
        // suppress a later SELL confirmation attempt on the same symbol (an exit signal
        // is a different, risk-reducing decision and deserves its own cooldown clock).
        const cooldownKey = `${symbol}:${quantDecision.action}`;
        const lastAttempt = lastConfirmAttempt.get(cooldownKey) ?? 0;
        if (Date.now() - lastAttempt < AI_CONFIRM_COOLDOWN_MS) continue; // still cooling down, skip this tick
        lastConfirmAttempt.set(cooldownKey, Date.now());

        const { agreed, log: ensembleLog } = await confirmWithLlm(userId, symbol, settings.aiProvider, quantDecision, ctx);
        log = ensembleLog;
        if (!agreed) {
          results.push({ symbol, action: quantDecision.action, status: 'SKIPPED_NO_ENSEMBLE_AGREEMENT' });
          continue;
        }
        // Direction agreement alone isn't enough — the true (blended) confidence must
        // still clear the user's configured bar. Without this, a high-confidence quant
        // signal paired with a barely-agreeing low-confidence LLM vote could slip a
        // materially weaker trade through a threshold the user set expecting it to
        // bound overall confidence, not just the quant leg.
        if (log.confidence < minConfidence) {
          results.push({ symbol, action: quantDecision.action, status: 'SKIPPED_LOW_CONFIDENCE', confidence: log.confidence });
          continue;
        }
      } else {
        log = await AIDecisionLog.create({
          userId,
          symbol,
          action: quantDecision.action,
          quantity: quantDecision.quantity,
          stopLoss: quantDecision.stopLoss,
          target: quantDecision.target,
          reason: quantDecision.reason,
          confidence: quantDecision.confidence,
          models: [{ name: 'Quant', action: quantDecision.action, confidence: quantDecision.confidence }],
          indicatorsSnapshot: ctx,
        });
      }

      try {
        const order = await placeOrder(userId, {
          symbol,
          action: quantDecision.action,
          quantity: quantDecision.quantity,
          stopLoss: quantDecision.stopLoss,
          target: quantDecision.target,
          source: 'automatic',
          triggerReason: quantDecision.reason,
          aiDecisionId: log._id,
        });
        log.resultingOrderId = order.orderId;
        log.riskResult = { allowed: true, reason: '' };
        await log.save();
        if (quantDecision.action === 'BUY') {
          openSymbols.add(symbol);
          openPositionCount += 1;
        } else {
          openSymbols.delete(symbol);
          openPositionCount = Math.max(0, openPositionCount - 1);
        }
        results.push({ symbol, action: quantDecision.action, status: order.status });
      } catch (err) {
        log.riskResult = { allowed: false, reason: err.message };
        await log.save();
        results.push({ symbol, action: quantDecision.action, status: 'BLOCKED', reason: err.message });
      }
    } catch (err) {
      console.error(`[autoTradingService] tick failed for ${symbol}:`, err.message);
    }
  }

  return { ran: true, results };
}

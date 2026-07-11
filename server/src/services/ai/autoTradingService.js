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
import { DEFAULT_USER_ID, STOCK_UNIVERSE, OPTION_UNDERLYINGS } from '../../config/constants.js';
import { UserSettings } from '../../models/UserSettings.js';
import { Position } from '../../models/Position.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { buildContext, buildOptionsContext } from './contextBuilder.js';
import { scoreQuant, scoreQuantOptions } from './aiSignalService.js';
import { callProvider, callProviderOptions, resolveOptionContract } from './decisionEngine.js';
import { placeOrder } from '../orderService.js';
import { effectiveMode } from '../brokers/tradingModeService.js';
import { isMarketOpen } from '../../utils/marketHours.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { getRiskConfig } from '../risk/riskConfig.js';

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

/**
 * Options counterpart to confirmWithLlm() — an agreement additionally requires the
 * LLM to have picked the SAME option side (CE vs PE) as Quant, not just the same
 * action (both are always 'BUY' when this is called, since WAIT never reaches here).
 * @param {string} userId @param {string} underlyingSymbol
 * @param {Awaited<ReturnType<typeof resolveOptionContract>>} contract @param {string} providerKey
 * @param {import('../../types.js').AiOptionsDecision} quantDecision
 * @param {import('../../types.js').OptionsIndicatorSnapshot} ctx
 * @returns {Promise<{agreed:boolean, log:object}>}
 */
async function confirmOptionsWithLlm(userId, underlyingSymbol, contract, providerKey, quantDecision, ctx) {
  let llm = null;
  let llmError = null;
  try {
    llm = await callProviderOptions(providerKey, ctx);
  } catch (err) {
    llmError = err.message;
  }

  const agreed = Boolean(llm) && llm.action === quantDecision.action && llm.optionType === quantDecision.optionType;
  const optionType = agreed ? quantDecision.optionType : null;
  const tradingSymbol = optionType ? contract[optionType.toLowerCase()].tradingSymbol : null;

  const log = await AIDecisionLog.create({
    userId,
    symbol: tradingSymbol ?? `${contract.underlying}-${contract.strike}`,
    segment: 'FNO',
    underlying: contract.underlying,
    strike: contract.strike,
    expiry: contract.expiry,
    optionType,
    lotSize: contract.lotSize,
    action: agreed ? quantDecision.action : 'WAIT',
    quantity: agreed ? quantDecision.quantity : 0,
    stopLoss: agreed ? quantDecision.stopLoss : null,
    target: agreed ? quantDecision.target : null,
    reason: llm
      ? `Ensemble ${agreed ? 'agreed' : 'disagreed'}: Quant=${quantDecision.action}${quantDecision.optionType ? ` ${quantDecision.optionType}` : ''} (${quantDecision.reason}); ${llm.providerLabel}=${llm.action}${llm.optionType ? ` ${llm.optionType}` : ''} (${llm.reason})`
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
  const openPositionsBySymbol = new Map(openPositions.map((p) => [p.symbol, p]));
  const openSymbols = new Set(openPositions.map((p) => p.symbol));
  // Mutable — refreshed as the loop places orders, so maxOpenPositions is actually
  // enforced across symbols within a single tick (the pre-loop snapshot above would
  // otherwise let every symbol in this tick pass the same stale count check).
  let openPositionCount = openPositions.length;
  const minConfidence = settings.autoInvest.minConfidence ?? 75;
  const riskConfig = await getRiskConfig(userId);
  const results = [];

  for (const { symbol } of STOCK_UNIVERSE) {
    try {
      const ctx = await buildContext(symbol, userId);
      const quantDecision = scoreQuant(symbol, ctx, settings.autoInvest.amountPerTrade, riskConfig.maxLossPerTrade);

      if (quantDecision.action === 'WAIT') continue;

      if (quantDecision.action === 'SELL') {
        // A SELL from quant only ever means "close the existing long" (see the
        // `!openSymbols.has(symbol)` skip a few lines down — a SELL is never a fresh
        // short entry on this platform). scoreQuant computes its quantity as an
        // independent fresh-entry sizing figure, unrelated to what's actually held —
        // using it to sell risked either leaving a residual position un-exited
        // (undersized) or the whole order being rejected outright for exceeding the
        // held quantity (oversized, the exact "No sufficient position to sell" failure
        // already seen from manual orders). Use the real held quantity instead.
        const heldQuantity = openPositionsBySymbol.get(symbol)?.quantity;
        if (heldQuantity) quantDecision.quantity = heldQuantity;
      }
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

  // Options: an underlying (e.g. NIFTY) reuses the same overall maxOpenPositions budget
  // and requireAiConfirmation/minConfidence settings as equity. Unlike equity, there is
  // no SELL branch here — a fresh options entry is the only thing this decides; exiting
  // an existing option position is handled the same way as equity, automatically, by
  // positionGuardianJob/squareOffJob watching the Position's stored stopLoss/target.
  const openUnderlyings = new Set(openPositions.filter((p) => p.segment === 'FNO').map((p) => p.underlying));

  for (const { symbol: underlyingSymbol } of OPTION_UNDERLYINGS) {
    try {
      if (openUnderlyings.has(underlyingSymbol)) continue;
      if (openPositionCount >= settings.autoInvest.maxOpenPositions) continue;

      const contract = await resolveOptionContract(underlyingSymbol);
      const ctx = await buildOptionsContext(contract, userId);
      const quantDecision = scoreQuantOptions(ctx, settings.autoInvest.amountPerTrade, riskConfig.maxLossPerTrade);

      if (quantDecision.action === 'WAIT') continue;

      if (['closing', 'after-square-off'].includes(ctx.sessionPhase)) {
        results.push({ symbol: underlyingSymbol, action: quantDecision.action, status: 'SKIPPED_TOO_CLOSE_TO_SQUAREOFF' });
        continue;
      }
      if (quantDecision.confidence < minConfidence) {
        results.push({ symbol: underlyingSymbol, action: quantDecision.action, status: 'SKIPPED_LOW_CONFIDENCE', confidence: quantDecision.confidence });
        continue;
      }

      let log;
      if (settings.autoInvest.requireAiConfirmation) {
        const cooldownKey = `OPT:${underlyingSymbol}:${quantDecision.optionType}`;
        const lastAttempt = lastConfirmAttempt.get(cooldownKey) ?? 0;
        if (Date.now() - lastAttempt < AI_CONFIRM_COOLDOWN_MS) continue;
        lastConfirmAttempt.set(cooldownKey, Date.now());

        const { agreed, log: ensembleLog } = await confirmOptionsWithLlm(userId, underlyingSymbol, contract, settings.aiProvider, quantDecision, ctx);
        log = ensembleLog;
        if (!agreed) {
          results.push({ symbol: underlyingSymbol, action: quantDecision.action, status: 'SKIPPED_NO_ENSEMBLE_AGREEMENT' });
          continue;
        }
        if (log.confidence < minConfidence) {
          results.push({ symbol: underlyingSymbol, action: quantDecision.action, status: 'SKIPPED_LOW_CONFIDENCE', confidence: log.confidence });
          continue;
        }
      } else {
        log = await AIDecisionLog.create({
          userId,
          symbol: contract[quantDecision.optionType.toLowerCase()].tradingSymbol,
          segment: 'FNO',
          underlying: contract.underlying,
          strike: contract.strike,
          expiry: contract.expiry,
          optionType: quantDecision.optionType,
          lotSize: contract.lotSize,
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

      const tradingSymbol = contract[log.optionType.toLowerCase()].tradingSymbol;

      try {
        const order = await placeOrder(userId, {
          symbol: tradingSymbol,
          action: 'BUY',
          quantity: log.quantity,
          stopLoss: log.stopLoss,
          target: log.target,
          source: 'automatic',
          triggerReason: log.reason,
          aiDecisionId: log._id,
          segment: 'FNO',
        });
        log.resultingOrderId = order.orderId;
        log.riskResult = { allowed: true, reason: '' };
        await log.save();
        openUnderlyings.add(underlyingSymbol);
        openPositionCount += 1;
        results.push({ symbol: underlyingSymbol, action: 'BUY', status: order.status });
      } catch (err) {
        log.riskResult = { allowed: false, reason: err.message };
        await log.save();
        results.push({ symbol: underlyingSymbol, action: 'BUY', status: 'BLOCKED', reason: err.message });
      }
    } catch (err) {
      console.error(`[autoTradingService] options tick failed for ${underlyingSymbol}:`, err.message);
    }
  }

  return { ran: true, results };
}

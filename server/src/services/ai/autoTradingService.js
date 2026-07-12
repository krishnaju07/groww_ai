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
import { DEFAULT_USER_ID } from '../../config/constants.js';
import { UserSettings } from '../../models/UserSettings.js';
import { Position } from '../../models/Position.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { buildContext, buildOptionsContext } from './contextBuilder.js';
import { scoreQuant, scoreQuantOptions } from './aiSignalService.js';
import { callProvider, callProviderOptions, resolveOptionContract } from './decisionEngine.js';
import { runConsensus } from './consensusService.js';
import { getLearnedEdge } from './learnedEdgeService.js';
import { AutoTradeActivity } from '../../models/AutoTradeActivity.js';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
/** @param {Date} [d] @returns {number} IST hour-of-day for learned-edge bucketing */
function currentIstHour(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCHours();
}
import { placeOrder } from '../orderService.js';
import { effectiveMode } from '../brokers/tradingModeService.js';
import { isMarketOpen, getAutoTradeWindowStatus, istDateKey } from '../../utils/marketHours.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { getRiskConfig } from '../risk/riskConfig.js';
import { getNearestExpiry } from '../instruments/instrumentService.js';
import { getMarketRegime } from './regimeService.js';
import { mapWithConcurrency } from '../../utils/concurrency.js';

const AI_CONFIRM_COOLDOWN_MS = 5 * 60 * 1000; // don't re-confirm the same symbol more than once per 5 min
const lastConfirmAttempt = new Map(); // symbol -> timestamp
// Context-building (market data + news + track record) per symbol/underlying is the
// expensive, fully independent part of a tick — safe to prefetch concurrently ahead of
// the sequential decision/order-placement pass below (which must stay sequential: it
// mutates openPositionCount/openSymbols across iterations to enforce maxOpenPositions).
const CONTEXT_PREFETCH_CONCURRENCY = 5;

// Last-persisted (symbol -> "action|status|reason") signature, so a symbol stuck in the
// SAME state tick after tick (e.g. perpetually low-confidence, or a persistently broken
// data feed) writes ONE row and then stays silent until something actually changes,
// instead of one row every 30s forever. Process-lifetime only (resets on restart) — worst
// case after a restart is one harmless repeat row, not unbounded growth.
const lastActivitySignature = new Map(); // symbol -> signature string

/**
 * Persists this tick's decisions (fire-and-forget — a logging failure must never affect
 * the tick's actual return value or block it) so they're visible via GET /ai/activity /
 * the LiveTrading feed, not just the server console. `optionsStartIndex` marks where the
 * options section's entries begin in `results` (equity and options share one array),
 * since neither section tags its own pushes with a segment.
 * @param {string} userId @param {object[]} results @param {number} optionsStartIndex
 */
function persistTickActivity(userId, results, optionsStartIndex) {
  if (!results.length) return;
  const tickAt = new Date();
  const docs = results
    .map((r, i) => ({
      userId,
      tickAt,
      symbol: r.symbol,
      segment: i >= optionsStartIndex ? 'FNO' : 'CASH',
      action: r.action ?? null,
      status: r.status,
      reason: r.reason ?? '',
      confidence: r.confidence ?? null,
      opportunityScore: r.opportunityScore ?? null,
    }))
    .filter((d) => {
      const signature = `${d.action}|${d.status}|${d.reason}`;
      if (lastActivitySignature.get(d.symbol) === signature) return false;
      lastActivitySignature.set(d.symbol, signature);
      return true;
    });
  if (!docs.length) return;
  AutoTradeActivity.insertMany(docs).catch((err) => console.error('[autoTradingService] activity persist failed:', err.message));
}

/**
 * @param {string} userId @param {string} symbol @param {string} providerKey
 * @param {import('../../types.js').AiDecision} quantDecision
 * @param {import('../../types.js').IndicatorSnapshot} ctx
 * @param {string} [modelOverride] UserSettings.aiModel — falls back to the provider's env-configured default when empty
 * @returns {Promise<{agreed:boolean, log:object}>}
 */
async function confirmWithLlm(userId, symbol, providerKey, quantDecision, ctx, modelOverride, consensus) {
  // Consensus mode — poll every configured LLM and require N to agree with Quant.
  if (consensus?.enabled) {
    const c = await runConsensus({ mode: 'equity', symbol, ctx, quantDecision, aiModel: modelOverride, minAgree: consensus.minAgree });
    const log = await AIDecisionLog.create({
      userId,
      symbol,
      action: c.agreed ? quantDecision.action : 'WAIT',
      quantity: c.agreed ? quantDecision.quantity : 0,
      stopLoss: c.agreed ? quantDecision.stopLoss : null,
      target: c.agreed ? quantDecision.target : null,
      reason: c.reason,
      confidence: c.agreed ? c.confidence : 0,
      models: [
        { name: 'Quant', action: quantDecision.action, confidence: quantDecision.confidence },
        ...c.votes.filter((v) => v.ok).map((v) => ({ name: v.provider, model: v.model, action: v.action, confidence: v.confidence })),
      ],
      indicatorsSnapshot: ctx,
    });
    return { agreed: c.agreed, log };
  }

  let llm = null;
  let llmError = null;
  try {
    llm = await callProvider(providerKey, symbol, ctx, modelOverride);
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
      ...(llm ? [{ name: llm.providerLabel, model: llm.modelUsed, action: llm.action, confidence: llm.confidence }] : []),
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
 * @param {string} [modelOverride] UserSettings.aiModel — falls back to the provider's env-configured default when empty
 * @returns {Promise<{agreed:boolean, log:object}>}
 */
async function confirmOptionsWithLlm(userId, underlyingSymbol, contract, providerKey, quantDecision, ctx, modelOverride, consensus) {
  // Consensus mode — poll every configured LLM; agreement requires backing both the BUY
  // and the SAME side (CE/PE) as Quant (runConsensus keys options agreement on optionType).
  if (consensus?.enabled) {
    const c = await runConsensus({ mode: 'options', ctx, quantDecision, aiModel: modelOverride, minAgree: consensus.minAgree });
    const optType = c.agreed ? quantDecision.optionType : null;
    const tSym = optType ? contract[optType.toLowerCase()].tradingSymbol : null;
    const log = await AIDecisionLog.create({
      userId,
      symbol: tSym ?? `${contract.underlying}-${contract.strike}`,
      segment: 'FNO',
      underlying: contract.underlying,
      strike: contract.strike,
      expiry: contract.expiry,
      optionType: optType,
      lotSize: contract.lotSize,
      action: c.agreed ? quantDecision.action : 'WAIT',
      quantity: c.agreed ? quantDecision.quantity : 0,
      stopLoss: c.agreed ? quantDecision.stopLoss : null,
      target: c.agreed ? quantDecision.target : null,
      reason: c.reason,
      confidence: c.agreed ? c.confidence : 0,
      opportunityScore: quantDecision.opportunityScore ?? null,
      models: [
        { name: 'Quant', action: quantDecision.action, confidence: quantDecision.confidence },
        ...c.votes.filter((v) => v.ok).map((v) => ({ name: v.provider, model: v.model, action: v.action, confidence: v.confidence })),
      ],
      indicatorsSnapshot: ctx,
    });
    return { agreed: c.agreed, log };
  }

  let llm = null;
  let llmError = null;
  try {
    llm = await callProviderOptions(providerKey, ctx, modelOverride);
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
      ...(llm ? [{ name: llm.providerLabel, model: llm.modelUsed, action: llm.action, confidence: llm.confidence }] : []),
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

  // Not .lean() — a pre-existing UserSettings document created before `watchlist`
  // existed won't have it in its raw stored data; only a hydrated Mongoose document
  // applies the schema's watchlist defaults on read.
  const settings = await UserSettings.findOne({ userId });
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

  // Time-of-day discipline — gates only fresh ENTRIES (never exits). Computed once per
  // tick; the equity loop checks it per-BUY, the options loop (all fresh entries) up front.
  const windowStatus = getAutoTradeWindowStatus(settings.systemConfig);

  // Market-regime gate — "classify before trading; sit out choppy/undecided markets."
  // Fresh entries require a tradeable broad-market regime when the filter is enabled.
  // Folded into windowStatus so both the equity per-BUY check and the options up-front
  // check enforce it with one code path. Exits are unaffected (they don't read this).
  // Fetched unconditionally (30s-cached, cheap) so the learned-edge gate can bucket by
  // the regime in effect regardless of whether the filter itself is on.
  const tickRegime = await getMarketRegime();
  if (settings.systemConfig?.regimeFilterEnabled && !tickRegime.tradeable) {
    windowStatus.allowed = false;
    windowStatus.reason = `Regime gate: ${tickRegime.reason}`;
  }

  // Learned-edge gate config, resolved once per tick.
  const learningGate = {
    enabled: settings.systemConfig?.learningGateEnabled ?? true,
    minSample: settings.systemConfig?.learningMinSample ?? 5,
  };
  const tickHour = currentIstHour();

  const equityContexts = await mapWithConcurrency(settings.watchlist.equities, CONTEXT_PREFETCH_CONCURRENCY, async (symbol) => {
    try {
      return await buildContext(symbol, userId);
    } catch (err) {
      console.error(`[autoTradingService] buildContext failed for ${symbol}:`, err.message);
      return null;
    }
  });
  const equityContextBySymbol = new Map(settings.watchlist.equities.map((s, i) => [s, equityContexts[i]]));

  for (const symbol of settings.watchlist.equities) {
    try {
      const ctx = equityContextBySymbol.get(symbol);
      if (!ctx) {
        results.push({ symbol, status: 'CONTEXT_FETCH_FAILED' });
        continue;
      }
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
      // Time-of-day discipline blocks fresh entries only (a SELL exit must still get through).
      if (quantDecision.action === 'BUY' && !windowStatus.allowed) {
        results.push({ symbol, action: 'BUY', status: 'SKIPPED_TRADING_WINDOW', reason: windowStatus.reason });
        continue;
      }
      if (quantDecision.confidence < minConfidence) {
        results.push({ symbol, action: quantDecision.action, status: 'SKIPPED_LOW_CONFIDENCE', confidence: quantDecision.confidence });
        continue;
      }
      // Learned-edge gate — don't re-take a fresh entry the AI's own history proves it
      // loses on (this regime / this hour). BUY-only; an exit is never blocked.
      if (quantDecision.action === 'BUY' && learningGate.enabled) {
        const edge = await getLearnedEdge(userId, { regime: tickRegime.regime, hour: tickHour }, { minSample: learningGate.minSample });
        if (edge.verdict === 'VETO') {
          results.push({ symbol, action: 'BUY', status: 'SKIPPED_NEGATIVE_EDGE', reason: edge.reason });
          continue;
        }
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

        const { agreed, log: ensembleLog } = await confirmWithLlm(userId, symbol, settings.aiProvider, quantDecision, ctx, settings.aiModel, {
          enabled: settings.systemConfig?.consensusEnabled,
          minAgree: settings.systemConfig?.consensusMinAgree ?? 2,
        });
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
  // Since every options decision here is a fresh ENTRY, the time-of-day window gates the
  // whole section up front rather than per-underlying.
  const optionsStartIndex = results.length;
  if (!windowStatus.allowed) {
    results.push({ symbol: 'OPTIONS', status: 'SKIPPED_TRADING_WINDOW', reason: windowStatus.reason });
    persistTickActivity(userId, results, optionsStartIndex);
    return { ran: true, results };
  }
  const openUnderlyings = new Set(openPositions.filter((p) => p.segment === 'FNO').map((p) => p.underlying));

  const optionUnderlyings = settings.watchlist.optionUnderlyings;
  const optionPrefetch = await mapWithConcurrency(optionUnderlyings, CONTEXT_PREFETCH_CONCURRENCY, async (underlyingSymbol) => {
    try {
      const contract = await resolveOptionContract(underlyingSymbol);
      const ctx = await buildOptionsContext(contract, userId);
      return { contract, ctx };
    } catch (err) {
      console.error(`[autoTradingService] options context prefetch failed for ${underlyingSymbol}:`, err.message);
      return null;
    }
  });
  const optionPrefetchByUnderlying = new Map(optionUnderlyings.map((s, i) => [s, optionPrefetch[i]]));

  const todayKey = istDateKey();
  for (const underlyingSymbol of optionUnderlyings) {
    try {
      if (openUnderlyings.has(underlyingSymbol)) continue;
      if (openPositionCount >= settings.autoInvest.maxOpenPositions) continue;

      // Expiry-day avoidance — the underlying's weekly expiry is whippy (fast theta decay,
      // pin risk). Skip fresh entries on that day when configured. Nearest expiry comes
      // from the synced instrument data (same source resolveOptionContract uses).
      if (settings.systemConfig?.avoidExpiryDay) {
        const nearestExpiry = await getNearestExpiry(underlyingSymbol).catch(() => null);
        if (nearestExpiry && istDateKey(new Date(nearestExpiry)) === todayKey) {
          results.push({ symbol: underlyingSymbol, status: 'SKIPPED_EXPIRY_DAY' });
          continue;
        }
      }

      const prefetched = optionPrefetchByUnderlying.get(underlyingSymbol);
      if (!prefetched) {
        results.push({ symbol: underlyingSymbol, status: 'CONTEXT_FETCH_FAILED' });
        continue;
      }
      const { contract, ctx } = prefetched;
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
      // Opportunity-score gate — the cost-minimization + quality bar. A weak setup is
      // dropped BEFORE spending an LLM call (the confirm step below), which is the whole
      // point of the scanner: only pay to reason about genuinely promising contracts.
      const oppThreshold = settings.systemConfig?.opportunityScoreThreshold ?? 55;
      if ((quantDecision.opportunityScore ?? 0) < oppThreshold) {
        results.push({ symbol: underlyingSymbol, action: quantDecision.action, status: 'SKIPPED_LOW_OPPORTUNITY', opportunityScore: quantDecision.opportunityScore });
        continue;
      }
      // Learned-edge gate — options entries are always fresh; veto proven-losing conditions
      // (this regime / this side / this hour) before spending an LLM call on them.
      if (learningGate.enabled) {
        const edge = await getLearnedEdge(userId, { regime: tickRegime.regime, optionType: quantDecision.optionType, hour: tickHour }, { minSample: learningGate.minSample });
        if (edge.verdict === 'VETO') {
          results.push({ symbol: underlyingSymbol, action: quantDecision.action, status: 'SKIPPED_NEGATIVE_EDGE', reason: edge.reason });
          continue;
        }
      }

      let log;
      if (settings.autoInvest.requireAiConfirmation) {
        const cooldownKey = `OPT:${underlyingSymbol}:${quantDecision.optionType}`;
        const lastAttempt = lastConfirmAttempt.get(cooldownKey) ?? 0;
        if (Date.now() - lastAttempt < AI_CONFIRM_COOLDOWN_MS) continue;
        lastConfirmAttempt.set(cooldownKey, Date.now());

        const { agreed, log: ensembleLog } = await confirmOptionsWithLlm(userId, underlyingSymbol, contract, settings.aiProvider, quantDecision, ctx, settings.aiModel, {
          enabled: settings.systemConfig?.consensusEnabled,
          minAgree: settings.systemConfig?.consensusMinAgree ?? 2,
        });
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

  persistTickActivity(userId, results, optionsStartIndex);
  return { ran: true, results };
}

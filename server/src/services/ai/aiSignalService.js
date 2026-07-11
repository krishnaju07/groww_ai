import { round2 } from '../../utils/format.js';
import { DEFAULT_RISK_CONFIG } from '../../config/constants.js';
import { computeOpportunityScore } from './opportunityScore.js';

// Fallback-only — used when ATR isn't available yet (fresh symbol, not enough candle
// history). Whenever ctx.atr > 0, stop/target are sized off real volatility instead.
const DEFAULT_STOP_LOSS_PERCENT = 1.5;
const DEFAULT_TARGET_PERCENT = 3;
const ATR_STOP_MULTIPLIER = 1.5;
const ATR_TARGET_MULTIPLIER = 3; // keeps the same 2:1 reward:risk ratio as the ATR stop
const BUY_THRESHOLD = 3;
const SELL_THRESHOLD = -3;
// A symbol needs at least this many of its own closed AI trades before its track record
// is trusted to move confidence — otherwise a couple of lucky/unlucky trades would swing
// it on noise.
const TRACK_RECORD_MIN_SAMPLE = 5;

/**
 * Shared directional scorer — everything about the setup EXCEPT position sizing
 * (stop/target/quantity) and the track-record confidence nudge, which differ enough
 * between equity (priced/sized in the stock's own ₹, single track record) and options
 * (priced in premium, sized in lots, a track record PER SIDE that isn't known until
 * this function's score picks a direction) that each caller applies those separately —
 * see applyTrackRecordAdjustment() and scoreQuant()/scoreQuantOptions() below.
 * @param {import('../../types.js').IndicatorSnapshot|import('../../types.js').OptionsIndicatorSnapshot} ctx
 * @returns {{score:number, confidence:number, reasons:string[]}}
 */
function computeDirectionalSignal(ctx) {
  let score = 0;
  const reasons = [];

  if (ctx.rsi < 30) {
    score += 2;
    reasons.push(`RSI ${ctx.rsi} oversold`);
  } else if (ctx.rsi > 70) {
    score -= 2;
    reasons.push(`RSI ${ctx.rsi} overbought`);
  }

  if (ctx.macd.histogram > 0) {
    score += 1;
    reasons.push('MACD histogram positive');
  } else if (ctx.macd.histogram < 0) {
    score -= 1;
    reasons.push('MACD histogram negative');
  }

  // Multi-timeframe confluence: 5m/15m/30m trends must actually agree before this
  // counts for much — a single 5m blip shouldn't move the score on its own.
  const timeframes = [ctx.trendShortTerm, ctx.trendMediumTerm, ctx.trendLongTerm];
  const upCount = timeframes.filter((t) => t === 'UP').length;
  const downCount = timeframes.filter((t) => t === 'DOWN').length;
  if (upCount >= 2) {
    score += upCount === 3 ? 3 : 2;
    reasons.push(`${upCount}/3 timeframes (5m/15m/30m) trending UP`);
  } else if (downCount >= 2) {
    score -= downCount === 3 ? 3 : 2;
    reasons.push(`${downCount}/3 timeframes (5m/15m/30m) trending DOWN`);
  } else {
    reasons.push('timeframes disagree — no trend confluence');
  }

  if (ctx.psar?.trend === 'UP') {
    score += 1;
    reasons.push(`Parabolic SAR bullish (price above ₹${ctx.psar.value})`);
  } else if (ctx.psar?.trend === 'DOWN') {
    score -= 1;
    reasons.push(`Parabolic SAR bearish (price below ₹${ctx.psar.value})`);
  }

  if (ctx.supertrend?.trend === 'UP') {
    score += 1;
    reasons.push(`Supertrend bullish (₹${ctx.supertrend.value})`);
  } else if (ctx.supertrend?.trend === 'DOWN') {
    score -= 1;
    reasons.push(`Supertrend bearish (₹${ctx.supertrend.value})`);
  }

  const refPrice = ctx.ltp ?? ctx.spotLtp;
  if (ctx.levels.support && refPrice <= ctx.levels.support * 1.005) {
    score += 1;
    reasons.push('price near support');
  } else if (ctx.levels.resistance && refPrice >= ctx.levels.resistance * 0.995) {
    score -= 1;
    reasons.push('price near resistance');
  }

  if (/bullish/i.test(ctx.niftySentiment)) {
    score += 1;
    reasons.push('Nifty bullish bias');
  } else if (/bearish/i.test(ctx.niftySentiment)) {
    score -= 1;
    reasons.push('Nifty bearish bias');
  }

  const volumeConfirmed = ctx.volumeRatio >= 1.2;
  if (volumeConfirmed) reasons.push(`volume ${ctx.volumeRatio}x average confirms move`);

  const confidence = Math.min(95, Math.round((Math.abs(score) / 10) * 100 * (volumeConfirmed ? 1 : 0.7)));

  return { score, confidence, reasons };
}

/**
 * The track record nudges confidence — a technically-identical setup deserves more
 * skepticism where past AI calls have gone badly, and can afford a touch more trust
 * where they've gone well. Bounded (±30% relative) so it can never flip a WAIT-worthy
 * signal into an actionable one (or vice versa) on its own, and requires a real sample
 * size so a couple of lucky/unlucky trades don't swing it. Mutates `reasons` in place
 * (appends an explanation) when the adjustment actually applies.
 * @param {number} confidence @param {{totalClosed:number, winRate:number|null}|undefined} tr @param {string[]} reasons @param {string} [label]
 * @returns {number}
 */
function applyTrackRecordAdjustment(confidence, tr, reasons, label = "this symbol's own") {
  if (tr && tr.totalClosed >= TRACK_RECORD_MIN_SAMPLE) {
    if (tr.winRate < 40) {
      reasons.push(`${label} track record is weak (${tr.winRate}% over ${tr.totalClosed} trades) — confidence reduced`);
      return Math.round(confidence * 0.7);
    }
    if (tr.winRate > 65) {
      reasons.push(`${label} track record is strong (${tr.winRate}% over ${tr.totalClosed} trades)`);
      return Math.min(95, Math.round(confidence * 1.1));
    }
  }
  return confidence;
}

/**
 * Deterministic technical-indicator scorer — no LLM call, so it's cheap enough
 * to run every 30s in the auto-trading cron. Also used as Claude's cross-check
 * partner (a live BUY/SELL should ideally have both models agree). This is the
 * scorer actually driving position sizing for every automated trade (autoTradingService
 * places orders using ITS quantity, not the LLM's advisory one) — so its stop/target/
 * sizing logic is the real risk-control surface, not just a cheap fallback.
 * @param {string} symbol
 * @param {import('../../types.js').IndicatorSnapshot} ctx
 * @param {number} [investmentAmount] soft cap — never invest more than this much capital in one trade
 * @param {number} [maxLossPerTrade] hard cap — quantity is sized so a full stop-loss hit never loses more than this
 * @returns {import('../../types.js').AiDecision}
 */
export function scoreQuant(symbol, ctx, investmentAmount = 5000, maxLossPerTrade = DEFAULT_RISK_CONFIG.maxLossPerTrade) {
  const { score, confidence: baseConfidence, reasons } = computeDirectionalSignal(ctx);
  const confidence = applyTrackRecordAdjustment(baseConfidence, ctx.trackRecord, reasons);

  // Real volatility (ATR), not an arbitrary flat percentage, sizes the stop/target — falls
  // back to the flat percentage only when there isn't enough candle history for ATR yet.
  const stopDistance = ctx.atr > 0 ? ctx.atr * ATR_STOP_MULTIPLIER : ctx.ltp * (DEFAULT_STOP_LOSS_PERCENT / 100);
  const targetDistance = ctx.atr > 0 ? ctx.atr * ATR_TARGET_MULTIPLIER : ctx.ltp * (DEFAULT_TARGET_PERCENT / 100);

  // Position size is the SMALLER of two independent caps: never invest more than
  // investmentAmount (capital budget), and never risk more than maxLossPerTrade if the
  // stop is hit (risk budget). Without the risk-budget side, a volatile stock with a wide
  // ATR-based stop could size a position whose worst case blows well past what the user
  // configured as their per-trade risk tolerance.
  const budgetBasedQty = Math.max(1, Math.floor(investmentAmount / ctx.ltp));
  const riskBasedQty = stopDistance > 0 ? Math.max(1, Math.floor(maxLossPerTrade / stopDistance)) : budgetBasedQty;
  const quantity = Math.max(1, Math.min(budgetBasedQty, riskBasedQty));

  if (score >= BUY_THRESHOLD) {
    return {
      action: 'BUY',
      quantity,
      stopLoss: round2(ctx.ltp - stopDistance),
      target: round2(ctx.ltp + targetDistance),
      reason: reasons.join('; '),
      confidence,
    };
  }

  if (score <= SELL_THRESHOLD) {
    return {
      action: 'SELL',
      quantity,
      stopLoss: round2(ctx.ltp + stopDistance),
      target: round2(ctx.ltp - targetDistance),
      reason: reasons.join('; '),
      confidence,
    };
  }

  return {
    action: 'WAIT',
    quantity: 0,
    stopLoss: round2(ctx.ltp),
    target: round2(ctx.ltp),
    reason: reasons.length ? reasons.join('; ') : 'No strong directional signal',
    confidence: Math.round(Math.abs(score) * 10),
  };
}

// Options can't be shorted by this platform (BUY always means "buy calls/puts to
// open") — a bullish underlying signal means buy the CALL, a bearish one means buy
// the PUT. Falls back to a flat percent-of-premium when the contract doesn't have
// enough of its own candle history yet for a premium ATR (see contextBuilder.buildOptionsContext).
const OPTIONS_STOP_LOSS_PERCENT = 30; // of premium
const OPTIONS_TARGET_PERCENT = 60; // of premium — keeps the same 2:1 reward:risk ratio
const OPTIONS_ATR_STOP_MULTIPLIER = 1.5;
const OPTIONS_ATR_TARGET_MULTIPLIER = 3;
const DIRECTIONAL_THRESHOLD = 3; // |score| at/above this counts as a real directional signal

/**
 * Options counterpart to scoreQuant() — same directional signal (computed on the
 * underlying index, via computeDirectionalSignal), but sizing/stop/target are in
 * PREMIUM terms and quantity is in whole lots. Always a fresh-entry decision (BUY a
 * CE or PE, or WAIT) — exiting an existing option position is handled the same way
 * as equity, by positionGuardianJob/squareOffJob watching the Position's stored
 * stopLoss/target, not by this function.
 * @param {import('../../types.js').OptionsIndicatorSnapshot} ctx
 * @param {number} [investmentAmount] soft cap — never invest more than this much capital in one trade
 * @param {number} [maxLossPerTrade] hard cap — quantity is sized so a full stop-loss hit never loses more than this
 * @returns {import('../../types.js').AiOptionsDecision}
 */
export function scoreQuantOptions(ctx, investmentAmount = 5000, maxLossPerTrade = DEFAULT_RISK_CONFIG.maxLossPerTrade) {
  const { score, confidence: baseConfidence, reasons } = computeDirectionalSignal(ctx);

  if (Math.abs(score) < DIRECTIONAL_THRESHOLD) {
    return {
      action: 'WAIT',
      optionType: null,
      quantity: 0,
      stopLoss: round2(ctx.ce.premium),
      target: round2(ctx.ce.premium),
      reason: reasons.length ? reasons.join('; ') : 'No strong directional signal',
      confidence: Math.round(Math.abs(score) * 10),
      opportunityScore: 0,
    };
  }

  // score > 0 = bullish underlying → buy the CALL; score < 0 = bearish → buy the PUT.
  const optionType = score > 0 ? 'CE' : 'PE';
  const side = optionType === 'CE' ? ctx.ce : ctx.pe;
  const confidence = applyTrackRecordAdjustment(baseConfidence, side.trackRecord, reasons, `this direction's (${ctx.underlying} ${optionType})`);

  // Opportunity score (0-100) — the scanner rank that also gates whether this setup is
  // worth an expensive LLM call. Uses greeks (from premium) + regime + liquidity/chain
  // intel when available. See opportunityScore.js.
  const opportunity = computeOpportunityScore({
    optionType,
    premium: side.premium,
    directionalScore: score,
    regime: ctx.regime ?? { tradeable: true, bias: 'NONE' },
    greeks: side.greeks ?? null,
    liquidity: side.liquidity ?? null,
    chainIntel: ctx.chainIntel ?? null,
    sessionPhase: ctx.sessionPhase,
  });

  const stopDistance = side.premiumAtr > 0 ? side.premiumAtr * OPTIONS_ATR_STOP_MULTIPLIER : side.premium * (OPTIONS_STOP_LOSS_PERCENT / 100);
  const targetDistance = side.premiumAtr > 0 ? side.premiumAtr * OPTIONS_ATR_TARGET_MULTIPLIER : side.premium * (OPTIONS_TARGET_PERCENT / 100);

  // Same two-cap sizing as equity (never invest more than the budget, never risk more
  // than maxLossPerTrade on a full stop), but per-LOT (premium × lotSize is the cost/risk
  // of one lot), then converted to a total contract quantity.
  const costPerLot = side.premium * ctx.lotSize;
  const riskPerLot = stopDistance * ctx.lotSize;
  const budgetBasedLots = costPerLot > 0 ? Math.max(1, Math.floor(investmentAmount / costPerLot)) : 1;
  const riskBasedLots = riskPerLot > 0 ? Math.max(1, Math.floor(maxLossPerTrade / riskPerLot)) : budgetBasedLots;
  const lots = Math.max(1, Math.min(budgetBasedLots, riskBasedLots));
  const quantity = lots * ctx.lotSize;

  return {
    action: 'BUY',
    optionType,
    quantity,
    stopLoss: round2(Math.max(0, side.premium - stopDistance)),
    target: round2(side.premium + targetDistance),
    reason: `${optionType === 'CE' ? 'Bullish' : 'Bearish'} underlying signal — buying ${optionType}; ${reasons.join('; ')}`,
    confidence,
    opportunityScore: opportunity.score,
    opportunityBreakdown: opportunity.breakdown,
  };
}

import { round2 } from '../../utils/format.js';
import { DEFAULT_RISK_CONFIG } from '../../config/constants.js';

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

  if (ctx.levels.support && ctx.ltp <= ctx.levels.support * 1.005) {
    score += 1;
    reasons.push('price near support');
  } else if (ctx.levels.resistance && ctx.ltp >= ctx.levels.resistance * 0.995) {
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

  let confidence = Math.min(95, Math.round((Math.abs(score) / 10) * 100 * (volumeConfirmed ? 1 : 0.7)));

  // This symbol's own track record nudges confidence — a technically-identical setup
  // deserves more skepticism on a stock whose past AI calls have gone badly, and can
  // afford a touch more trust where they've gone well. Bounded (±30% relative) so it can
  // never flip a WAIT-worthy signal into an actionable one (or vice versa) on its own,
  // and requires a real sample size so a couple of lucky/unlucky trades don't swing it.
  const tr = ctx.trackRecord;
  if (tr && tr.totalClosed >= TRACK_RECORD_MIN_SAMPLE) {
    if (tr.winRate < 40) {
      confidence = Math.round(confidence * 0.7);
      reasons.push(`this symbol's own track record is weak (${tr.winRate}% over ${tr.totalClosed} trades) — confidence reduced`);
    } else if (tr.winRate > 65) {
      confidence = Math.min(95, Math.round(confidence * 1.1));
      reasons.push(`this symbol's own track record is strong (${tr.winRate}% over ${tr.totalClosed} trades)`);
    }
  }

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

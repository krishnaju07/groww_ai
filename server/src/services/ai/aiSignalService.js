import { round2, applyPercent } from '../../utils/format.js';

const DEFAULT_STOP_LOSS_PERCENT = 1.5;
const DEFAULT_TARGET_PERCENT = 3;
const BUY_THRESHOLD = 3;
const SELL_THRESHOLD = -3;

/**
 * Deterministic technical-indicator scorer — no LLM call, so it's cheap enough
 * to run every 30s in the auto-trading cron. Also used as Claude's cross-check
 * partner (a live BUY/SELL should ideally have both models agree).
 * @param {string} symbol
 * @param {import('../../types.js').IndicatorSnapshot} ctx
 * @param {number} [investmentAmount]
 * @returns {import('../../types.js').AiDecision}
 */
export function scoreQuant(symbol, ctx, investmentAmount = 5000) {
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

  if (ctx.trend === 'UP') {
    score += 1;
    reasons.push('short-term uptrend');
  } else if (ctx.trend === 'DOWN') {
    score -= 1;
    reasons.push('short-term downtrend');
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

  const confidence = Math.min(95, Math.round((Math.abs(score) / 6) * 100 * (volumeConfirmed ? 1 : 0.7)));

  if (score >= BUY_THRESHOLD) {
    const quantity = Math.max(1, Math.floor(investmentAmount / ctx.ltp));
    return {
      action: 'BUY',
      quantity,
      stopLoss: applyPercent(ctx.ltp, -DEFAULT_STOP_LOSS_PERCENT),
      target: applyPercent(ctx.ltp, DEFAULT_TARGET_PERCENT),
      reason: reasons.join('; '),
      confidence,
    };
  }

  if (score <= SELL_THRESHOLD) {
    const quantity = Math.max(1, Math.floor(investmentAmount / ctx.ltp));
    return {
      action: 'SELL',
      quantity,
      stopLoss: applyPercent(ctx.ltp, DEFAULT_STOP_LOSS_PERCENT),
      target: applyPercent(ctx.ltp, -DEFAULT_TARGET_PERCENT),
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

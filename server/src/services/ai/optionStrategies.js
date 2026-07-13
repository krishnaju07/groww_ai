/**
 * Options strategy selection — the "don't use one strategy for every market condition"
 * layer. Today's only options approach (scoreQuantOptions in aiSignalService.js) is a
 * directional trend-continuation read: it needs the underlying to have a real trend, so
 * regimeService.js correctly marks HIGH_VOLATILITY as non-tradeable for it (a violent,
 * directionless market is the WORST condition for "pick a side"). But high volatility with
 * an unclear direction is exactly the textbook setup for a LONG STRADDLE — buy both the
 * CE and the PE, profit from a big move in EITHER direction, direction itself doesn't
 * matter. This module adds that second strategy and a selector that picks between them
 * (or sits out entirely) based on the current regime.
 *
 * Known simplification: a real straddle is usually managed as one combined position (let
 * the winning leg run, don't touch the losing leg — it's SUPPOSED to decay while the
 * other leg captures the move). This platform's positionGuardianJob manages exits per-leg
 * (each CE/PE is its own Position), not as a combined pair. Rather than build a new
 * combined-position exit subsystem, each leg gets a generously wide stop/target so a
 * normal decaying leg isn't cut before the other leg has had a chance to develop — an
 * honest approximation of the real strategy using existing infrastructure, not a perfect
 * one.
 */
import { round2 } from '../../utils/format.js';

// Per-leg stop/target as % of that leg's own premium. Wide on purpose — one leg WILL bleed
// toward zero as the underlying moves away from it; that's the strategy working, not a
// mistake, so it shouldn't be stopped out early. The winning leg is given real room to run.
const STRADDLE_LEG_STOP_PERCENT = 55;
const STRADDLE_LEG_TARGET_PERCENT = 120;

/**
 * Which options strategy fits the current regime, if any.
 * @param {{regime:string, tradeable:boolean, atrPercent?:number}|null|undefined} regime
 * @param {{volatilityStraddleEnabled?:boolean}} [opts]
 * @returns {'DIRECTIONAL'|'VOLATILITY_STRADDLE'|'SIT_OUT'}
 */
export function selectOptionsStrategy(regime, opts = {}) {
  if (!regime) return 'DIRECTIONAL'; // no regime data — fall back to today's default, unchanged behavior
  if (regime.regime === 'HIGH_VOLATILITY') {
    return opts.volatilityStraddleEnabled ? 'VOLATILITY_STRADDLE' : 'SIT_OUT';
  }
  return regime.tradeable ? 'DIRECTIONAL' : 'SIT_OUT';
}

/**
 * Long-straddle sizing — buy both CE and PE at (near) the same strike. Unlike the
 * directional strategy, max loss on a straddle IS the full combined premium (if the
 * underlying doesn't move enough before expiry), so the budget/risk caps size directly off
 * combined premium rather than a separate stop-distance calculation.
 * @param {import('../../types.js').OptionsIndicatorSnapshot} ctx
 * @param {number} [investmentAmount] soft cap — never invest more than this much combined
 * @param {number} [maxLossPerTrade] hard cap — sizing keeps worst-case (both legs expire worthless) within this
 * @returns {{action:'BUY'|'WAIT', strategy:'VOLATILITY_STRADDLE', lots:number, ceQuantity:number, peQuantity:number, ceStopLoss:number, ceTarget:number, peStopLoss:number, peTarget:number, confidence:number, reason:string}}
 */
export function scoreVolatilityStraddle(ctx, investmentAmount = 5000, maxLossPerTrade = 500) {
  const cePremium = ctx.ce?.premium;
  const pePremium = ctx.pe?.premium;

  if (!(cePremium > 0) || !(pePremium > 0)) {
    return {
      action: 'WAIT',
      strategy: 'VOLATILITY_STRADDLE',
      lots: 0,
      ceQuantity: 0,
      peQuantity: 0,
      ceStopLoss: 0,
      ceTarget: 0,
      peStopLoss: 0,
      peTarget: 0,
      confidence: 0,
      reason: 'Straddle needs both CE and PE premiums — one side is unavailable.',
    };
  }

  const combinedPremium = cePremium + pePremium;
  const costPerLot = combinedPremium * ctx.lotSize;
  // Worst case IS the full combined premium (both legs expire worthless) — so the same
  // number bounds both the budget cap and the risk cap; there's no separate stop-distance.
  const budgetBasedLots = Math.max(1, Math.floor(investmentAmount / costPerLot));
  const riskBasedLots = Math.max(1, Math.floor(maxLossPerTrade / costPerLot));
  const lots = Math.max(1, Math.min(budgetBasedLots, riskBasedLots));
  const quantity = lots * ctx.lotSize;

  // Confidence scales with how far volatility exceeds the threshold that triggered this
  // regime in the first place — a bigger excess is a stronger case for a real expansion
  // (vs. a borderline reading that just barely crossed the line).
  const atrPercent = ctx.regime?.atrPercent ?? 0;
  const confidence = Math.max(50, Math.min(85, Math.round(50 + atrPercent * 10)));

  return {
    action: 'BUY',
    strategy: 'VOLATILITY_STRADDLE',
    lots,
    ceQuantity: quantity,
    peQuantity: quantity,
    ceStopLoss: round2(cePremium * (1 - STRADDLE_LEG_STOP_PERCENT / 100)),
    ceTarget: round2(cePremium * (1 + STRADDLE_LEG_TARGET_PERCENT / 100)),
    peStopLoss: round2(pePremium * (1 - STRADDLE_LEG_STOP_PERCENT / 100)),
    peTarget: round2(pePremium * (1 + STRADDLE_LEG_TARGET_PERCENT / 100)),
    confidence,
    reason: `High-volatility regime (ATR ${atrPercent}%) — direction unclear but a big move is likely; buying both ${ctx.underlying} CE and PE (long straddle) to profit either way.`,
  };
}

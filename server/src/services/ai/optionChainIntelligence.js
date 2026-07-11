/**
 * Option-chain intelligence — the derived, institutional-positioning view the vision
 * calls for (PCR, Max Pain, OI-based support/resistance, liquidity). Pure functions over
 * a chain of per-strike CE/PE quotes, so they're fully testable now with synthetic data,
 * and produce real signals the moment Groww's F&O quote data (open_interest, volume, …)
 * is entitled. When OI data is absent (the current no-subscription state), everything
 * degrades to `available: false` rather than emitting misleading zeros.
 */
import { round2 } from '../../utils/format.js';

/**
 * @typedef {Object} ChainQuote
 * @property {number} strike
 * @property {{premium:number|null, oi:number|null, oiChange:number|null, volume:number|null, iv:number|null, bidPrice:number|null, askPrice:number|null}|null} ce
 * @property {{premium:number|null, oi:number|null, oiChange:number|null, volume:number|null, iv:number|null, bidPrice:number|null, askPrice:number|null}|null} pe
 */

const num = (v) => (Number.isFinite(v) ? v : 0);
const hasOi = (side) => side && Number.isFinite(side.oi) && side.oi > 0;

/**
 * @param {ChainQuote[]} chain @param {number} spotPrice
 * @returns {{available:boolean, pcr:number|null, maxPain:number|null, totalCallOi:number, totalPutOi:number,
 *   resistanceStrike:number|null, supportStrike:number|null, biasNote:string}}
 */
export function analyzeChain(chain, spotPrice) {
  const withOi = chain.filter((row) => hasOi(row.ce) || hasOi(row.pe));
  if (!withOi.length) {
    return {
      available: false,
      pcr: null,
      maxPain: null,
      totalCallOi: 0,
      totalPutOi: 0,
      resistanceStrike: null,
      supportStrike: null,
      biasNote: 'Open-interest data unavailable — chain intelligence (PCR/max-pain/OI levels) inactive until the F&O data feed is live.',
    };
  }

  const totalCallOi = withOi.reduce((s, r) => s + num(r.ce?.oi), 0);
  const totalPutOi = withOi.reduce((s, r) => s + num(r.pe?.oi), 0);
  const pcr = totalCallOi > 0 ? round2(totalPutOi / totalCallOi) : null;

  // Highest call-OI strike acts as resistance (writers defending above); highest put-OI
  // strike acts as support (writers defending below) — standard OI-wall interpretation.
  const resistanceStrike = argmaxStrike(withOi, (r) => num(r.ce?.oi));
  const supportStrike = argmaxStrike(withOi, (r) => num(r.pe?.oi));

  const maxPain = computeMaxPain(withOi);

  // PCR interpretation is deliberately hedged — it's a positioning gauge, not a signal on
  // its own (very high PCR can be contrarian-bullish; low PCR contrarian-bearish). We hand
  // the number + a neutral note to the LLM rather than pre-baking a directional call.
  let biasNote = 'PCR neutral.';
  if (pcr != null) {
    if (pcr > 1.3) biasNote = `PCR ${pcr} (heavy put writing) — often supportive/contrarian-bullish, but crowded.`;
    else if (pcr < 0.7) biasNote = `PCR ${pcr} (heavy call writing) — often capping/contrarian-bearish.`;
    else biasNote = `PCR ${pcr} — balanced positioning.`;
  }

  return {
    available: true,
    pcr,
    maxPain,
    totalCallOi,
    totalPutOi,
    resistanceStrike,
    supportStrike,
    biasNote,
  };
}

/**
 * Max Pain — the expiry strike at which the total intrinsic payout to option HOLDERS
 * (i.e. the pain to writers) is minimized. Price often gravitates here into expiry.
 * = argmin over candidate strikes E of Σ_K [ callOI(K)·max(0,E−K) + putOI(K)·max(0,K−E) ].
 * @param {ChainQuote[]} withOi @returns {number|null}
 */
function computeMaxPain(withOi) {
  const strikes = withOi.map((r) => r.strike);
  let best = null;
  let bestPain = Infinity;
  for (const E of strikes) {
    let pain = 0;
    for (const r of withOi) {
      pain += num(r.ce?.oi) * Math.max(0, E - r.strike); // calls ITM when spot(E) > strike
      pain += num(r.pe?.oi) * Math.max(0, r.strike - E); // puts ITM when spot(E) < strike
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = E;
    }
  }
  return best;
}

/** @param {ChainQuote[]} rows @param {(r:ChainQuote)=>number} valueOf @returns {number|null} the strike with the max value, or null if all zero */
function argmaxStrike(rows, valueOf) {
  let best = null;
  let bestVal = 0;
  for (const r of rows) {
    const v = valueOf(r);
    if (v > bestVal) {
      bestVal = v;
      best = r.strike;
    }
  }
  return best;
}

/**
 * Per-contract liquidity read — a contract with thin volume/OI or a wide bid-ask is
 * dangerous to trade regardless of how good the directional case looks (you pay the
 * spread on entry AND exit, and may not fill). Returns a 0-100 liquidity score plus the
 * raw spread%. Degrades to null when the underlying quote fields aren't available.
 * @param {{premium:number|null, oi:number|null, volume:number|null, bidPrice:number|null, askPrice:number|null}|null} side
 * @returns {{score:number, spreadPercent:number|null}|null}
 */
export function liquidityOf(side) {
  if (!side) return null;
  const { premium, oi, volume, bidPrice, askPrice } = side;
  if (!Number.isFinite(oi) && !Number.isFinite(volume) && !Number.isFinite(bidPrice)) return null;

  let score = 0;
  // OI depth (up to 40 pts) — a rough log scale so 100k+ OI saturates.
  if (Number.isFinite(oi) && oi > 0) score += Math.min(40, (Math.log10(oi) / 6) * 40);
  // Day volume (up to 30 pts).
  if (Number.isFinite(volume) && volume > 0) score += Math.min(30, (Math.log10(volume) / 6) * 30);

  // Bid-ask spread as % of premium (up to 30 pts, tighter = better).
  let spreadPercent = null;
  if (Number.isFinite(bidPrice) && Number.isFinite(askPrice) && Number.isFinite(premium) && premium > 0 && askPrice >= bidPrice) {
    spreadPercent = round2(((askPrice - bidPrice) / premium) * 100);
    // 0% spread → full 30, ≥5% → 0.
    score += Math.max(0, 30 * (1 - Math.min(spreadPercent, 5) / 5));
  }

  return { score: Math.round(score), spreadPercent };
}

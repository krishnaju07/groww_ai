/**
 * Black-Scholes option greeks + implied-volatility solver — pure math, zero external
 * data. Used as a FALLBACK/cross-check for Groww's own /live-data/greeks (which is the
 * primary source when the F&O data subscription is active): if Groww greeks aren't
 * entitled but we have a premium + spot + expiry, we can still derive greeks by first
 * solving for implied vol from the market premium, then computing greeks from it. This
 * is genuinely testable and correct today, before any live data flows.
 *
 * Conventions: T in YEARS, r the annual risk-free rate (~6.5% for India), sigma the
 * annualized volatility (0.20 = 20%). theta is returned PER CALENDAR DAY (the intraday-
 * relevant decay), vega PER 1 VOL POINT (i.e. per 1% IV move), rho per 1% rate move.
 */

const RISK_FREE_RATE = 0.065; // India ~6.5% — a reasonable default; exact value barely moves intraday greeks
const DAYS_PER_YEAR = 365;

/** Standard normal PDF. @param {number} x @returns {number} */
function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF via the Abramowitz-Stegun 7.1.26 approximation (max abs error ~7.5e-8) —
 * accurate enough for option greeks and avoids pulling in a stats dependency.
 * @param {number} x @returns {number}
 */
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-0.5 * x * x);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

/** @param {'CE'|'PE'} type @param {number} S spot @param {number} K strike @param {number} T years @param {number} sigma @param {number} [r] @returns {number} theoretical premium */
export function blackScholesPrice(type, S, K, T, sigma, r = RISK_FREE_RATE) {
  if (T <= 0 || sigma <= 0) {
    // At/after expiry (or zero vol) the option is worth only its intrinsic value.
    return type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'CE') return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/**
 * @param {'CE'|'PE'} type @param {number} S @param {number} K @param {number} T years @param {number} sigma @param {number} [r]
 * @returns {{delta:number, gamma:number, theta:number, vega:number, rho:number}}
 */
export function greeks(type, S, K, T, sigma, r = RISK_FREE_RATE) {
  if (T <= 0 || sigma <= 0) {
    // Degenerate: delta is a step (1/0 for ITM/OTM call), everything else ~0.
    const itm = type === 'CE' ? S > K : S < K;
    return { delta: itm ? (type === 'CE' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdfD1 = normPdf(d1);

  const delta = type === 'CE' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdfD1 / (S * sigma * sqrtT);
  const vegaPerYear = S * pdfD1 * sqrtT; // per 1.00 vol
  const vega = vegaPerYear / 100; // per 1% vol

  // Theta per year, then convert to per-day.
  const term1 = -(S * pdfD1 * sigma) / (2 * sqrtT);
  const thetaPerYear =
    type === 'CE'
      ? term1 - r * K * Math.exp(-r * T) * normCdf(d2)
      : term1 + r * K * Math.exp(-r * T) * normCdf(-d2);
  const theta = thetaPerYear / DAYS_PER_YEAR;

  const rhoPerYear = type === 'CE' ? K * T * Math.exp(-r * T) * normCdf(d2) : -K * T * Math.exp(-r * T) * normCdf(-d2);
  const rho = rhoPerYear / 100; // per 1% rate

  return {
    delta: round(delta, 4),
    gamma: round(gamma, 6),
    theta: round(theta, 3),
    vega: round(vega, 3),
    rho: round(rho, 3),
  };
}

/**
 * Solve for implied volatility from a market premium via bisection (robust — no
 * derivative needed, always converges when a solution exists in the bracket).
 * @param {'CE'|'PE'} type @param {number} marketPrice @param {number} S @param {number} K @param {number} T years @param {number} [r]
 * @returns {number|null} annualized IV (0.20 = 20%), or null if it can't be bracketed (e.g. price below intrinsic)
 */
export function impliedVol(type, marketPrice, S, K, T, r = RISK_FREE_RATE) {
  if (T <= 0 || marketPrice <= 0) return null;
  const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  if (marketPrice < intrinsic - 1e-6) return null; // arbitrage/bad data — no real IV

  let lo = 1e-4;
  let hi = 5; // 500% vol upper bracket — generous enough for even the wildest expiry-day premiums
  const priceAt = (sig) => blackScholesPrice(type, S, K, T, sig, r);
  if (priceAt(hi) < marketPrice) return hi; // price implies vol above our bracket; clamp

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const diff = priceAt(mid) - marketPrice;
    if (Math.abs(diff) < 1e-4) return round(mid, 4);
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return round((lo + hi) / 2, 4);
}

/** @param {Date|string} expiry @param {Date} [now] @returns {number} time to expiry in YEARS (floored at ~0 at/after expiry) */
export function yearsToExpiry(expiry, now = new Date()) {
  const ms = new Date(expiry).getTime() - now.getTime();
  return Math.max(0, ms / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000));
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

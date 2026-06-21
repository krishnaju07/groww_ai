import { SLIPPAGE_MIN, SLIPPAGE_MAX } from '../config/constants.js';

/**
 * Round a number to 2 decimal places (money/price boundary rounding).
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Format a number as Indian Rupees, e.g. "₹1,23,456.78".
 * @param {number} n
 * @returns {string}
 */
export function formatINR(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

/**
 * Random integer in [min, max], inclusive of both bounds.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Apply a random slippage fill to a market price.
 * BUY fills higher: price * (1 + slip); SELL fills lower: price * (1 - slip).
 * slip is a random value in [SLIPPAGE_MIN, SLIPPAGE_MAX]. Result is round2'd.
 * @param {number} price       base/last price
 * @param {TradeAction} action 'BUY' | 'SELL'
 * @returns {number} fill price including slippage
 */
export function slippageFill(price, action) {
  const slip = SLIPPAGE_MIN + Math.random() * (SLIPPAGE_MAX - SLIPPAGE_MIN);
  const filled = action === 'BUY' ? Number(price) * (1 + slip) : Number(price) * (1 - slip);
  return round2(filled);
}

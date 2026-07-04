/** @param {number} n @returns {number} */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** @param {number} value @param {number} percent @returns {number} value shifted by ±percent */
export function applyPercent(value, percent) {
  return round2(value * (1 + percent / 100));
}

/** @param {number} part @param {number} whole @returns {number} percent, 0 if whole is 0 */
export function percentOf(part, whole) {
  if (!whole) return 0;
  return round2((part / whole) * 100);
}

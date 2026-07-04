const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** @param {number} n @returns {string} */
export function formatINR(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return inr.format(n);
}

/** @param {number} n @returns {string} */
export function formatINRWhole(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return inrWhole.format(n);
}

/** @param {number} n @param {number} [digits] @returns {string} */
export function formatPercent(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

/** @param {string|Date} d @returns {string} */
export function formatTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** @param {string|Date} d @returns {string} */
export function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

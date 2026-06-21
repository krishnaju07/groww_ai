/**
 * Formatting helpers shared across the GrowwAI client.
 * Indian-locale money/number formatting + signed percent + P&L color classes.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

/**
 * Format a number as Indian Rupee currency, e.g. ₹12,34,567.89.
 * @param {number} n
 * @returns {string}
 */
export function formatINR(n) {
  const value = Number.isFinite(n) ? n : 0;
  return inrFormatter.format(value);
}

/**
 * Format a number as a signed percentage with 2 decimals, e.g. "+5.20%" / "-1.75%".
 * @param {number} n
 * @returns {string}
 */
export function formatPercent(n) {
  const value = Number.isFinite(n) ? n : 0;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format a plain number with Indian grouping and up to 2 decimals.
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  const value = Number.isFinite(n) ? n : 0;
  return numberFormatter.format(value);
}

/**
 * Format an ISO timestamp as a human-readable local date-time.
 * @param {string} iso
 * @returns {string}
 */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Tailwind text-color class for a P&L value:
 * positive → accent green, negative → danger red, zero/NaN → muted gray.
 * @param {number} n
 * @returns {'text-accent'|'text-danger'|'text-gray-400'}
 */
export function pnlColorClass(n) {
  const value = Number.isFinite(n) ? n : 0;
  if (value > 0) return 'text-accent';
  if (value < 0) return 'text-danger';
  return 'text-gray-400';
}

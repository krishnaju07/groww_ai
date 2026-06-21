import { formatINR, pnlColorClass } from '../../lib/format';
import { GLASS_PANEL, NUM, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').Position} Position
 */

/** Slippage estimate applied to the gross order value. */
const SLIPPAGE_RATE = 0.002;

/**
 * A single label → value row in the order summary.
 * @param {Object} props
 * @param {string} props.label
 * @param {string} props.value      Preformatted value string (carries `num`).
 * @param {string} [props.valueClass]  Optional extra classes for the value.
 * @param {boolean} [props.muted]   Render the label/value in a muted tone.
 * @returns {JSX.Element}
 */
function Row({ label, value, valueClass = 'text-text', muted = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={cx('text-xs', muted ? 'text-muted/80' : 'text-muted')}>{label}</span>
      <span className={cx(NUM, 'text-sm font-semibold tabular-nums', valueClass)}>{value}</span>
    </div>
  );
}

/**
 * OrderSummary — a glass panel breaking down the estimated cost / proceeds of
 * the pending order. Pure presentational; guards all missing data.
 *
 * @param {Object} props
 * @param {'BUY'|'SELL'} [props.action]       Order side.
 * @param {number} [props.price]              Live price per share.
 * @param {number} [props.estShares]          Estimated shares for a BUY.
 * @param {number} [props.amount]             Investment amount (BUY).
 * @param {number} [props.cashBalance]        Available cash.
 * @param {Position|null} [props.position]    Open position (for SELL).
 * @returns {JSX.Element}
 */
export default function OrderSummary({
  action = 'BUY',
  price = 0,
  estShares = 0,
  amount = 0,
  cashBalance = 0,
  position = null,
}) {
  const px = Number.isFinite(price) ? price : 0;
  const cash = Number.isFinite(cashBalance) ? cashBalance : 0;
  const shares = Number.isFinite(estShares) ? estShares : 0;

  const isSell = action === 'SELL';

  /** @type {Array<{ label: string, value: string, valueClass?: string }>} */
  let rows;

  if (isSell) {
    const qty = Number.isFinite(position?.quantity) ? position.quantity : 0;
    const proceeds = qty * px;
    const pnl = Number.isFinite(position?.unrealizedPnl) ? position.unrealizedPnl : 0;
    rows = [
      { label: 'Quantity', value: String(qty) },
      { label: 'Est. proceeds', value: formatINR(proceeds) },
      { label: 'Unrealized P&L', value: formatINR(pnl), valueClass: pnlColorClass(pnl) },
      { label: 'Cash after', value: formatINR(cash + proceeds) },
    ];
  } else {
    const gross = shares * px;
    const slippage = gross * SLIPPAGE_RATE;
    const cashAfter = cash - gross;
    rows = [
      { label: 'Est. cost', value: formatINR(gross) },
      { label: 'Est. slippage (~0.2%)', value: formatINR(slippage) },
      { label: 'Available cash', value: formatINR(cash) },
      {
        label: 'Cash after',
        value: formatINR(cashAfter),
        valueClass: cashAfter < 0 ? 'text-danger' : 'text-text',
      },
      { label: 'Shares after', value: String(shares) },
    ];
  }

  return (
    <div className={cx(GLASS_PANEL, 'divide-y divide-white/[0.04] px-3.5 py-1')}>
      {rows.map((r) => (
        <Row key={r.label} label={r.label} value={r.value} valueClass={r.valueClass} />
      ))}
    </div>
  );
}

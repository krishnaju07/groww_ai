import { Briefcase } from 'lucide-react';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { GLASS_PANEL, LABEL, NUM, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').Position} Position
 */

/**
 * PositionContext — compact summary of the user's open position in the selected
 * symbol: holding (qty @ avg price), current value, and live P&L. When there is
 * no position it shows a muted "No open position" line. Pure presentational;
 * guards missing data.
 *
 * @param {Object} props
 * @param {Position|null} [props.position]  Open position for the symbol (or null).
 * @param {number} [props.price]            Live price per share.
 * @returns {JSX.Element}
 */
export default function PositionContext({ position, price = 0 }) {
  if (!position) {
    return (
      <div className={cx(GLASS_PANEL, 'flex items-center gap-2.5 px-3.5 py-2.5')}>
        <Briefcase size={14} className="shrink-0 text-muted/70" />
        <p className="text-xs text-muted">No open position in this stock.</p>
      </div>
    );
  }

  const px = Number.isFinite(price) ? price : 0;
  const qty = Number.isFinite(position.quantity) ? position.quantity : 0;
  const avg = Number.isFinite(position.avgBuyPrice) ? position.avgBuyPrice : 0;
  const pnl = Number.isFinite(position.unrealizedPnl) ? position.unrealizedPnl : 0;
  const pnlPct = Number.isFinite(position.unrealizedPnlPercent)
    ? position.unrealizedPnlPercent
    : 0;
  const currentValue = qty * px;
  const pnlClass = pnlColorClass(pnl);

  return (
    <div className={cx(GLASS_PANEL, 'px-3.5 py-3')}>
      <div className="flex items-center justify-between gap-3">
        <span className={LABEL}>Your position</span>
        <span className={cx(NUM, 'text-xs font-semibold', pnlClass)}>
          {formatINR(pnl)} ({formatPercent(pnlPct)})
        </span>
      </div>

      <p className="mt-2 text-sm text-text">
        You hold{' '}
        <span className={cx(NUM, 'font-bold')}>{qty}</span>{' '}
        <span className="font-bold">{position.symbol}</span>{' '}
        <span className="text-muted">@ </span>
        <span className={cx(NUM, 'font-semibold')}>{formatINR(avg)}</span>
      </p>

      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Current value</span>
        <span className={cx(NUM, 'text-sm font-semibold text-text')}>
          {formatINR(currentValue)}
        </span>
      </div>
    </div>
  );
}

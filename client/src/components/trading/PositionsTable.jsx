import { XCircle, Wallet, ShieldAlert } from 'lucide-react';
import Spinner from '../common/Spinner';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { PILL, NUM, BTN_DANGER, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').Position} Position
 */

/**
 * Compute a short trailing-stop status note for a position: how far the current
 * price sits below the highest price seen since the position was opened.
 * @param {Position} p
 * @returns {{ atPeak:boolean, text:string }}
 */
function trailingNote(p) {
  const peak = Number.isFinite(p.highestPriceSeen) ? p.highestPriceSeen : 0;
  const cur = Number.isFinite(p.currentPrice) ? p.currentPrice : 0;
  if (peak <= 0 || cur <= 0) return { atPeak: false, text: '—' };
  const fromPeakPct = (cur / peak - 1) * 100;
  if (fromPeakPct >= 0) return { atPeak: true, text: `At peak ${formatINR(peak)}` };
  return {
    atPeak: false,
    text: `${formatPercent(fromPeakPct)} from ${formatINR(peak)}`,
  };
}

/**
 * PositionsTable — open positions with live P&L and a per-row Close (manual SELL)
 * action. Includes a trailing-stop status column noting drawdown from the peak
 * price seen while the position has been held.
 *
 * @param {Object} props
 * @param {Position[]} props.positions               Open positions.
 * @param {(symbol:string)=>void} props.onClose      Close a position (manual SELL).
 * @param {string|boolean} [props.closing]           Symbol currently closing, or a boolean.
 * @returns {JSX.Element}
 */
export default function PositionsTable({ positions, onClose, closing }) {
  const rows = Array.isArray(positions) ? positions : [];

  if (rows.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <Wallet size={22} className="text-muted/70" />
        <p className="text-sm text-muted">No open positions.</p>
        <p className="text-xs text-muted/70">
          Place a trade to start building your portfolio.
        </p>
      </div>
    );
  }

  /**
   * @param {string} symbol
   * @returns {boolean}
   */
  const isClosing = (symbol) =>
    typeof closing === 'string' ? closing === symbol : Boolean(closing);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
            <th className="py-3 pr-3">Symbol</th>
            <th className="py-3 pr-3 text-right">Qty</th>
            <th className="py-3 pr-3 text-right">Avg Price</th>
            <th className="py-3 pr-3 text-right">LTP</th>
            <th className="py-3 pr-3 text-right">Invested</th>
            <th className="py-3 pr-3 text-right">Value</th>
            <th className="py-3 pr-3 text-right">P&L</th>
            <th className="py-3 pr-3 text-right">Unrealized %</th>
            <th className="py-3 pr-3">Trailing Stop</th>
            <th className="py-3 pr-0 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const busy = isClosing(p.symbol);
            const trail = trailingNote(p);
            return (
              <tr
                key={p.id || p.symbol}
                className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <td className="py-3 pr-3 font-semibold text-text">
                  {p.symbol}
                </td>
                <td className={cx(NUM, 'py-3 pr-3 text-right text-text')}>
                  {p.quantity}
                </td>
                <td className={cx(NUM, 'py-3 pr-3 text-right text-text')}>
                  {formatINR(p.avgBuyPrice)}
                </td>
                <td className={cx(NUM, 'py-3 pr-3 text-right text-text')}>
                  {formatINR(p.currentPrice)}
                </td>
                <td className={cx(NUM, 'py-3 pr-3 text-right text-muted')}>
                  {formatINR(p.investedAmount)}
                </td>
                <td className={cx(NUM, 'py-3 pr-3 text-right text-text')}>
                  {formatINR(p.currentValue)}
                </td>
                <td
                  className={cx(
                    NUM,
                    'py-3 pr-3 text-right font-semibold',
                    pnlColorClass(p.unrealizedPnl),
                  )}
                >
                  {formatINR(p.unrealizedPnl)}
                </td>
                <td
                  className={cx(
                    NUM,
                    'py-3 pr-3 text-right font-semibold',
                    pnlColorClass(p.unrealizedPnlPercent),
                  )}
                >
                  {formatPercent(p.unrealizedPnlPercent)}
                </td>
                <td className="py-3 pr-3">
                  <span
                    className={cx(
                      PILL,
                      trail.atPeak
                        ? 'bg-accent/12 text-accent border border-accent/25'
                        : 'bg-white/5 text-muted border border-white/10',
                    )}
                  >
                    <ShieldAlert size={11} />
                    {trail.text}
                  </span>
                </td>
                <td className="py-3 pr-0 text-right">
                  <button
                    type="button"
                    onClick={() => onClose(p.symbol)}
                    disabled={busy}
                    className={BTN_DANGER}
                  >
                    {busy ? (
                      <Spinner size="sm" />
                    ) : (
                      <XCircle size={13} strokeWidth={2.5} />
                    )}
                    {busy ? 'Closing…' : 'Close'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

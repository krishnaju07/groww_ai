import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  XCircle,
  Wallet,
  ShieldAlert,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import Spinner from '../common/Spinner';
import EmptyState from '../common/EmptyState';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { PILL, NUM, BTN_DANGER, BTN_PRIMARY, GLASS_PANEL, LABEL, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').Position} Position
 */

/**
 * Sortable column descriptors. `key` selects the underlying value used for the
 * comparator; `type` chooses string vs numeric comparison.
 * @type {{ key:string, label:string, type:'string'|'number' }[]}
 */
const SORT_COLUMNS = [
  { key: 'symbol', label: 'Symbol', type: 'string' },
  { key: 'unrealizedPnl', label: 'P&L', type: 'number' },
  { key: 'currentValue', label: 'Value', type: 'number' },
  { key: 'unrealizedPnlPercent', label: 'Unrealized %', type: 'number' },
];

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
 * Renders a full table on `md+` and a stacked card list on mobile (`md:hidden`).
 * Column headers are clickable to sort a COPY of the positions (props are never
 * mutated). Shows an EmptyState when there are no open positions.
 *
 * @param {Object} props
 * @param {Position[]} props.positions               Open positions.
 * @param {(symbol:string)=>void} props.onClose      Close a position (manual SELL).
 * @param {string|boolean} [props.closing]           Symbol currently closing, or a boolean.
 * @returns {JSX.Element}
 */
export default function PositionsTable({ positions, onClose, closing }) {
  const rows = Array.isArray(positions) ? positions : [];

  // Local sort state: which column + direction. Default: P&L descending.
  const [sortKey, setSortKey] = useState('unrealizedPnl');
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  /**
   * Toggle the sort direction when re-clicking the active column, otherwise
   * switch to the new column (descending for numbers, ascending for strings).
   * @param {{ key:string, type:string }} col
   */
  const handleSort = (col) => {
    if (col.key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.type === 'string' ? 'asc' : 'desc');
    }
  };

  // Sort a COPY of the positions — never mutate the prop array.
  const sortedRows = useMemo(() => {
    const col = SORT_COLUMNS.find((c) => c.key === sortKey);
    const copy = [...rows];
    if (!col) return copy;
    const factor = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (col.type === 'string') {
        const av = String(a[col.key] ?? '');
        const bv = String(b[col.key] ?? '');
        return factor * av.localeCompare(bv);
      }
      const av = Number.isFinite(a[col.key]) ? a[col.key] : 0;
      const bv = Number.isFinite(b[col.key]) ? b[col.key] : 0;
      return factor * (av - bv);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No open positions"
        message="Place a trade to start building your portfolio."
        action={
          <Link to="/trade" className={BTN_PRIMARY}>
            Place a trade
          </Link>
        }
      />
    );
  }

  /**
   * @param {string} symbol
   * @returns {boolean}
   */
  const isClosing = (symbol) =>
    typeof closing === 'string' ? closing === symbol : Boolean(closing);

  /**
   * Chevron indicator for the active sort column.
   * @param {string} key
   * @returns {JSX.Element|null}
   */
  const sortIcon = (key) => {
    if (key !== sortKey) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} strokeWidth={2.5} />
    ) : (
      <ChevronDown size={12} strokeWidth={2.5} />
    );
  };

  /**
   * A clickable, keyboard-reachable, right-aligned sortable header cell.
   * @param {{ col:{key:string,label:string,type:string}, align?:string }} args
   */
  const SortHeader = ({ col, align = 'right' }) => {
    const active = col.key === sortKey;
    return (
      <th className={cx('py-3 pr-3', align === 'right' ? 'text-right' : 'text-left')}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          aria-label={`Sort by ${col.label}`}
          className={cx(
            'inline-flex items-center gap-1 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
            active ? 'text-accent' : 'text-muted hover:text-text',
          )}
        >
          <span>{col.label}</span>
          {sortIcon(col.key)}
        </button>
      </th>
    );
  };

  const symbolCol = SORT_COLUMNS[0];
  const pnlCol = SORT_COLUMNS[1];
  const valueCol = SORT_COLUMNS[2];
  const unrealizedPctCol = SORT_COLUMNS[3];

  return (
    <>
      {/* Desktop / tablet: full table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              <SortHeader col={symbolCol} align="left" />
              <th className="py-3 pr-3 text-right">Qty</th>
              <th className="py-3 pr-3 text-right">Avg Price</th>
              <th className="py-3 pr-3 text-right">LTP</th>
              <th className="py-3 pr-3 text-right">Invested</th>
              <SortHeader col={valueCol} />
              <SortHeader col={pnlCol} />
              <SortHeader col={unrealizedPctCol} />
              <th className="py-3 pr-3">Trailing Stop</th>
              <th className="py-3 pr-0 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((p) => {
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

      {/* Mobile: stacked glass cards with the same (labelled) fields */}
      <div className="flex flex-col gap-3 md:hidden">
        {/* Sort controls for mobile (the table headers are hidden here) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL}>Sort</span>
          {SORT_COLUMNS.map((col) => {
            const active = col.key === sortKey;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => handleSort(col)}
                aria-label={`Sort by ${col.label}`}
                className={cx(
                  PILL,
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  active
                    ? 'bg-accent/12 text-accent border border-accent/25'
                    : 'bg-white/5 text-muted border border-white/10',
                )}
              >
                {col.label}
                {sortIcon(col.key)}
              </button>
            );
          })}
        </div>

        {sortedRows.map((p) => {
          const busy = isClosing(p.symbol);
          const trail = trailingNote(p);
          return (
            <div key={p.id || p.symbol} className={cx(GLASS_PANEL, 'p-4')}>
              <div className="flex items-start justify-between gap-3">
                <span className="font-display text-base font-semibold text-text">
                  {p.symbol}
                </span>
                <span
                  className={cx(
                    NUM,
                    'text-right text-sm font-semibold',
                    pnlColorClass(p.unrealizedPnl),
                  )}
                >
                  {formatINR(p.unrealizedPnl)}
                  <span className="block text-xs">
                    {formatPercent(p.unrealizedPnlPercent)}
                  </span>
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className={LABEL}>Qty</dt>
                  <dd className={cx(NUM, 'text-text')}>{p.quantity}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className={LABEL}>Avg Price</dt>
                  <dd className={cx(NUM, 'text-text')}>
                    {formatINR(p.avgBuyPrice)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className={LABEL}>LTP</dt>
                  <dd className={cx(NUM, 'text-text')}>
                    {formatINR(p.currentPrice)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className={LABEL}>Invested</dt>
                  <dd className={cx(NUM, 'text-muted')}>
                    {formatINR(p.investedAmount)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className={LABEL}>Value</dt>
                  <dd className={cx(NUM, 'text-text')}>
                    {formatINR(p.currentValue)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className={LABEL}>Unrealized %</dt>
                  <dd
                    className={cx(
                      NUM,
                      'font-semibold',
                      pnlColorClass(p.unrealizedPnlPercent),
                    )}
                  >
                    {formatPercent(p.unrealizedPnlPercent)}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={LABEL}>Trailing Stop</span>
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
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => onClose(p.symbol)}
                  disabled={busy}
                  className={cx(BTN_DANGER, 'w-full')}
                >
                  {busy ? (
                    <Spinner size="sm" />
                  ) : (
                    <XCircle size={13} strokeWidth={2.5} />
                  )}
                  {busy ? 'Closing…' : 'Close'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

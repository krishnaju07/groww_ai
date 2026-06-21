import { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Receipt } from 'lucide-react';
import AutoBadge from '../common/AutoBadge';
import EmptyState from '../common/EmptyState';
import { formatINR, formatPercent, formatDateTime, pnlColorClass } from '../../lib/format';
import { PILL, NUM, GLASS_PANEL, LABEL, cx } from '../../lib/ui';

/**
 * Filter chip descriptors. `value` is matched against a trade's `tradeType`
 * (or 'all' to show everything).
 * @type {{ value:'all'|'manual'|'automatic', label:string }[]}
 */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Auto' },
];

/**
 * Compact glass table of the most recent trades. Renders a full table on `md+`
 * and a stacked card list on mobile (`md:hidden`). Local All/Manual/Auto filter
 * chips narrow the `trades` prop before render (default: All). Shows an
 * EmptyState when there are no trades to display.
 *
 * @param {Object} props
 * @param {import('../../types').Trade[]} props.trades
 * @returns {JSX.Element}
 */
export default function RecentTradesTable({ trades }) {
  const rows = Array.isArray(trades) ? trades : [];

  // Local filter state: 'all' | 'manual' | 'automatic'. Default: all.
  const [filter, setFilter] = useState('all');

  const filteredRows = useMemo(
    () => (filter === 'all' ? rows : rows.filter((t) => t.tradeType === filter)),
    [rows, filter],
  );

  /** Filter chip row — keyboard-reachable, focus-ringed pills. */
  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      <span className={LABEL}>Show</span>
      {FILTERS.map((f) => {
        const active = f.value === filter;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={active}
            className={cx(
              PILL,
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              active
                ? 'bg-accent/12 text-accent border border-accent/25'
                : 'bg-white/5 text-muted border border-white/10 hover:text-text',
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );

  if (rows.length === 0) {
    return <EmptyState icon={Receipt} title="No trades yet" message="Your executed trades will appear here." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {filterChips}

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No matching trades"
          message="No trades match this filter yet."
        />
      ) : (
        <>
          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2.5 pr-3">Symbol</th>
                  <th className="py-2.5 pr-3">Type</th>
                  <th className="py-2.5 pr-3">Action</th>
                  <th className="py-2.5 pr-3 text-right">Qty</th>
                  <th className="py-2.5 pr-3 text-right">Price</th>
                  <th className="py-2.5 pr-3 text-right">P&L</th>
                  <th className="py-2.5 pr-0 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((t) => {
                  const isBuy = t.action === 'BUY';
                  const ActionIcon = isBuy ? ArrowUpRight : ArrowDownRight;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="py-3 pr-3 font-display font-semibold text-text">{t.symbol}</td>
                      <td className="py-3 pr-3">
                        <AutoBadge type={t.tradeType} />
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isBuy ? 'text-accent' : 'text-danger'
                          }`}
                        >
                          <ActionIcon size={14} strokeWidth={2.5} />
                          {t.action}
                        </span>
                      </td>
                      <td className="num py-3 pr-3 text-right text-text">{t.quantity}</td>
                      <td className="num py-3 pr-3 text-right text-text">{formatINR(t.price)}</td>
                      <td className={`num py-3 pr-3 text-right font-semibold ${pnlColorClass(t.pnl)}`}>
                        {typeof t.pnl === 'number'
                          ? `${formatINR(t.pnl)} (${formatPercent(t.pnlPercent)})`
                          : '—'}
                      </td>
                      <td className="py-3 pr-0 text-right text-xs text-muted">
                        {formatDateTime(t.openedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked glass cards with the same (labelled) fields */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredRows.map((t) => {
              const isBuy = t.action === 'BUY';
              const ActionIcon = isBuy ? ArrowUpRight : ArrowDownRight;
              return (
                <div key={t.id} className={cx(GLASS_PANEL, 'p-4')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-display text-base font-semibold text-text">
                        {t.symbol}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-sm font-semibold ${
                          isBuy ? 'text-accent' : 'text-danger'
                        }`}
                      >
                        <ActionIcon size={14} strokeWidth={2.5} />
                        {t.action}
                      </span>
                    </div>
                    <AutoBadge type={t.tradeType} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className={LABEL}>Qty</dt>
                      <dd className={cx(NUM, 'text-text')}>{t.quantity}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className={LABEL}>Price</dt>
                      <dd className={cx(NUM, 'text-text')}>{formatINR(t.price)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className={LABEL}>P&L</dt>
                      <dd className={cx(NUM, 'font-semibold', pnlColorClass(t.pnl))}>
                        {typeof t.pnl === 'number'
                          ? `${formatINR(t.pnl)} (${formatPercent(t.pnlPercent)})`
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className={LABEL}>Time</dt>
                      <dd className="text-xs text-muted">{formatDateTime(t.openedAt)}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

import { ArrowUpRight, ArrowDownRight, Receipt } from 'lucide-react';
import AutoBadge from '../common/AutoBadge';
import { formatINR, formatPercent, formatDateTime, pnlColorClass } from '../../lib/format';

/**
 * Compact glass table of the most recent trades.
 * @param {Object} props
 * @param {import('../../types').Trade[]} props.trades
 * @returns {JSX.Element}
 */
export default function RecentTradesTable({ trades }) {
  const rows = Array.isArray(trades) ? trades : [];

  if (rows.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-muted">
          <Receipt size={22} />
        </span>
        <p className="text-sm font-medium text-muted">No trades yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
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
          {rows.map((t) => {
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
  );
}

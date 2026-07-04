import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { formatINR, formatPercent, formatTime } from '../../lib/format.js';

export function RecentTradesTable({ trades = [] }) {
  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Recent Trades</div>
      {!trades.length && <div className="py-6 text-center text-sm text-muted">No trades yet — place your first paper trade from the Trade page.</div>}
      {trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Side</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Price</th>
                <th className="pb-2 font-medium">P&amp;L</th>
                <th className="pb-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-border/50">
                  <td className="py-2 font-medium">{t.symbol}</td>
                  <td className="py-2">
                    <Badge tone={t.action === 'BUY' ? 'accent' : 'danger'}>{t.action}</Badge>
                  </td>
                  <td className="py-2">{t.quantity}</td>
                  <td className="py-2">{formatINR(t.price)}</td>
                  <td className={`py-2 ${t.pnl > 0 ? 'text-accent' : t.pnl < 0 ? 'text-danger' : 'text-muted'}`}>
                    {t.status === 'CLOSED' ? `${formatINR(t.pnl)} (${formatPercent(t.pnlPercent)})` : '—'}
                  </td>
                  <td className="py-2 text-muted">{formatTime(t.openedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

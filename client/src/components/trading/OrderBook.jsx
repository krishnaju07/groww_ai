import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { BTN_SECONDARY } from '../../lib/ui.js';
import { formatDateTime } from '../../lib/format.js';

const STATUS_TONE = { FILLED: 'accent', PLACED: 'info', PENDING: 'default', CANCELLED: 'default', REJECTED: 'danger', PARTIALLY_FILLED: 'warn' };

export function OrderBook({ orders = [], onCancel }) {
  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Order Book</div>
      {!orders.length && <div className="py-6 text-center text-sm text-muted">No orders yet.</div>}
      {orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Side</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Broker</th>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id} className="border-t border-border/50">
                  <td className="py-2 font-medium">{o.symbol}</td>
                  <td className="py-2">
                    <Badge tone={o.action === 'BUY' ? 'accent' : 'danger'}>{o.action}</Badge>
                  </td>
                  <td className="py-2">{o.quantity}</td>
                  <td className="py-2 capitalize text-muted">{o.broker}</td>
                  <td className="py-2">
                    <span className="capitalize text-muted">{o.source}</span>
                    {o.aiDecisionId?.confidence != null && (
                      <span className="ml-1.5 text-xs font-semibold text-accent">{o.aiDecisionId.confidence}%</span>
                    )}
                    {(o.aiDecisionId?.reason || o.triggerReason) && (
                      <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted" title={o.aiDecisionId?.reason || o.triggerReason}>
                        {o.aiDecisionId?.reason || o.triggerReason}
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    <Badge tone={STATUS_TONE[o.status] || 'default'}>{o.status}</Badge>
                    {o.rejectReason && <div className="mt-0.5 text-xs text-danger">{o.rejectReason}</div>}
                  </td>
                  <td className="py-2 text-muted">{formatDateTime(o.createdAt)}</td>
                  <td className="py-2">
                    {['PENDING', 'PLACED'].includes(o.status) && (
                      <button onClick={() => onCancel(o._id)} className={`${BTN_SECONDARY} px-2 py-1 text-xs`}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

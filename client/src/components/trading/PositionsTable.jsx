import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { formatINR, formatPercent } from '../../lib/format.js';

/** @param {{action?:string}|undefined} signal */
function aiViewFor(signal) {
  if (!signal) return null;
  if (signal.action === 'SELL') return { label: 'Consider Exit', tone: 'danger' };
  if (signal.action === 'BUY') return { label: 'Hold / Add', tone: 'accent' };
  return { label: 'Hold', tone: 'default' };
}

/** @param {{positions?:object[], signals?:Record<string,{action:string,confidence:number}>}} props */
export function PositionsTable({ positions = [], signals = {} }) {
  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Open Positions</div>
      {!positions.length && <div className="py-6 text-center text-sm text-muted">No open positions.</div>}
      {positions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Avg Price</th>
                <th className="pb-2 font-medium">LTP</th>
                <th className="pb-2 font-medium">P&amp;L</th>
                <th className="pb-2 font-medium">AI View</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const aiView = aiViewFor(signals[p.symbol]);
                return (
                  <tr key={p.symbol} className="border-t border-border/50">
                    <td className="py-2 font-medium">{p.symbol}</td>
                    <td className="py-2">{p.quantity}</td>
                    <td className="py-2">{formatINR(p.avgBuyPrice)}</td>
                    <td className="py-2">{formatINR(p.ltp)}</td>
                    <td className={`py-2 ${p.pnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {formatINR(p.pnl)} ({formatPercent(p.pnlPercent)})
                    </td>
                    <td className="py-2">{aiView ? <Badge tone={aiView.tone}>{aiView.label}</Badge> : <span className="text-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

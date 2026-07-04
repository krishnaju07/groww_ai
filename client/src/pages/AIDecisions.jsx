import { useState } from 'react';
import { useAIStore } from '../store/useAIStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { Card } from '../components/common/Card.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { formatDateTime } from '../lib/format.js';

const TONE = { BUY: 'accent', SELL: 'danger', WAIT: 'default' };
const FILTERS = ['ALL', 'BUY', 'SELL', 'WAIT'];

export function AIDecisions() {
  const decisions = useAIStore((s) => s.decisions);
  const fetchDecisions = useAIStore((s) => s.fetchDecisions);
  const [filter, setFilter] = useState('ALL');

  usePolling(() => fetchDecisions({ limit: 100 }), 10000);

  const filtered = filter === 'ALL' ? decisions : decisions.filter((d) => d.action === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">AI Decisions</h1>
        <p className="text-sm text-muted">Full audit trail of every Claude decision, including WAIT calls and risk-blocked trades.</p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card>
        {!filtered.length && <div className="py-6 text-center text-sm text-muted">No decisions match this filter yet.</div>}
        <div className="divide-y divide-border/50">
          {filtered.map((d) => (
            <div key={d._id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{d.symbol}</span>
                  <Badge tone={TONE[d.action]}>{d.action}</Badge>
                  {d.action !== 'WAIT' && <span className="text-xs text-muted">{d.quantity} shares</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{d.reason}</p>
                {d.riskResult?.allowed === false && (
                  <p className="mt-1 text-xs text-danger">Blocked by risk manager: {d.riskResult.reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <div>{formatDateTime(d.createdAt)}</div>
                <div className="mt-0.5">{d.confidence}% confidence</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { formatTime } from '../../lib/format.js';

const TONE = { BUY: 'accent', SELL: 'danger', WAIT: 'default' };

export function AIDecisionFeed({ decisions = [] }) {
  return (
    <Card>
      <div className="mb-3 font-display font-semibold">AI Decision Feed</div>
      {!decisions.length && <div className="py-6 text-center text-sm text-muted">No AI decisions yet.</div>}
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {decisions.map((d) => (
          <div key={d._id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{d.symbol}</span>
                <Badge tone={TONE[d.action]}>{d.action}</Badge>
              </div>
              <div className="mt-1 truncate text-xs text-muted" title={d.reason}>
                {d.reason || 'No reason recorded'}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-muted">
              <div>{formatTime(d.createdAt)}</div>
              <div className="mt-0.5">{d.confidence}% conf.</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

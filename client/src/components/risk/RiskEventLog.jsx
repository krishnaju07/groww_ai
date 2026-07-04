import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { formatDateTime } from '../../lib/format.js';

const TONE = { BLOCK: 'danger', ALLOW: 'accent', KILL_SWITCH_TRIP: 'danger', KILL_SWITCH_RESET: 'info' };

export function RiskEventLog({ events = [] }) {
  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Risk Event Log</div>
      {!events.length && <div className="py-6 text-center text-sm text-muted">No risk events yet.</div>}
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {events.map((e) => (
          <div key={e._id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
            <div className="min-w-0">
              <Badge tone={TONE[e.type] || 'default'}>{e.type.replace(/_/g, ' ')}</Badge>
              {e.reason && <p className="mt-1 text-xs text-muted">{e.reason}</p>}
            </div>
            <span className="shrink-0 text-xs text-muted">{formatDateTime(e.createdAt)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

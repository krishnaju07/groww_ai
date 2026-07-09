import { useState } from 'react';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { ConfidenceBar } from '../common/ConfidenceBar.jsx';
import { IndicatorBreakdown } from '../common/IndicatorBreakdown.jsx';
import { formatTime } from '../../lib/format.js';

const TONE = { BUY: 'accent', SELL: 'danger', WAIT: 'default' };
const BORDER = { BUY: 'border-l-accent', SELL: 'border-l-danger', WAIT: 'border-l-muted/40' };

export function AIDecisionFeed({ decisions = [] }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <Card>
      <div className="mb-3 font-display font-semibold">AI Decision Feed</div>
      {!decisions.length && <div className="py-6 text-center text-sm text-muted">No AI decisions yet.</div>}
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {decisions.map((d) => (
          <div
            key={d._id}
            className={`rounded-xl border border-l-4 border-border/60 bg-bg/30 p-3 transition-colors hover:border-accent/30 ${BORDER[d.action]}`}
          >
            <button
              onClick={() => setExpanded(expanded === d._id ? null : d._id)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{d.symbol}</span>
                  <Badge tone={TONE[d.action]}>{d.action}</Badge>
                </div>
                <div className="mt-1 truncate text-xs text-muted" title={d.reason}>
                  {d.reason || 'No reason recorded'}
                </div>
                <ConfidenceBar value={d.confidence} className="mt-2 max-w-[160px]" />
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <div>{formatTime(d.createdAt)}</div>
                <div className="mt-0.5 font-semibold text-text">{d.confidence}%</div>
              </div>
            </button>
            {expanded === d._id && (
              <div className="mt-2 space-y-2">
                {d.justification && <p className="text-xs text-muted">{d.justification}</p>}
                <IndicatorBreakdown snapshot={d.indicatorsSnapshot} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

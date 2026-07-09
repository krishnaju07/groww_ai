import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { ConfidenceBar } from '../common/ConfidenceBar.jsx';

const TONE = { BUY: 'accent', SELL: 'danger' };
const BORDER = { BUY: 'border-l-accent', SELL: 'border-l-danger' };

/** @param {{signals: Record<string, {action:string, confidence:number, reason:string, scoreBreakdown?:object}>}} props */
export function AITopPicks({ signals = {} }) {
  const picks = Object.entries(signals)
    .filter(([, s]) => s.action !== 'WAIT')
    .sort((a, b) => b[1].confidence - a[1].confidence)
    .slice(0, 5);

  return (
    <Card>
      <div className="mb-3 font-display font-semibold">AI Top Picks</div>
      {!picks.length && (
        <div className="py-6 text-center text-sm text-muted">
          No actionable signals right now — the background AI scan runs every few minutes.
        </div>
      )}
      <div className="space-y-2">
        {picks.map(([symbol, s]) => (
          <div
            key={symbol}
            className={`flex items-start justify-between gap-3 rounded-xl border border-l-4 border-border/60 bg-bg/30 p-3 transition-colors hover:border-accent/30 ${BORDER[s.action]}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{symbol}</span>
                <Badge tone={TONE[s.action]}>{s.action}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted" title={s.reason}>
                {s.reason}
              </p>
              <ConfidenceBar value={s.confidence} className="mt-2 max-w-[160px]" />
            </div>
            <span className="shrink-0 text-xs font-semibold text-text">{s.confidence}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

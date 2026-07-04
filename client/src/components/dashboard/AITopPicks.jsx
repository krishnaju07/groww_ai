import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';

const TONE = { BUY: 'accent', SELL: 'danger' };

/** @param {{signals: Record<string, {action:string, confidence:number, reason:string}>}} props */
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
          <div key={symbol} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{symbol}</span>
                <Badge tone={TONE[s.action]}>{s.action}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted" title={s.reason}>
                {s.reason}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted">{s.confidence}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

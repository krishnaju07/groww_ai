import { useEffect, useState } from 'react';
import { aiService } from '../../services/ai.service.js';
import { usePolling } from '../../hooks/usePolling.js';
import { formatTime } from '../../lib/format.js';

const STATUS_LABEL = {
  FILLED: 'Order placed',
  BLOCKED: 'Blocked by risk manager',
  CONTEXT_FETCH_FAILED: 'Market data fetch failed',
  SKIPPED_LOW_CONFIDENCE: 'Skipped — confidence too low',
  SKIPPED_LOW_OPPORTUNITY: 'Skipped — opportunity score too low',
  SKIPPED_NEGATIVE_EDGE: 'Skipped — learned edge is negative',
  SKIPPED_NO_ENSEMBLE_AGREEMENT: 'Skipped — AI providers disagreed',
  SKIPPED_TRADING_WINDOW: 'Skipped — outside trading window',
  SKIPPED_TOO_CLOSE_TO_SQUAREOFF: 'Skipped — too close to square-off',
  SKIPPED_EXPIRY_DAY: 'Skipped — expiry day',
};

const STATUS_TONE = {
  FILLED: 'text-accent border-accent/40',
  BLOCKED: 'text-danger border-danger/40',
  CONTEXT_FETCH_FAILED: 'text-danger border-danger/40',
};

function humanize(status) {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/**
 * "What is the auto-trader actually doing right now" — every decision from the 30s tick
 * (equity + options), including the ones that never became an order. Before this existed,
 * that information only ever hit the server console (autoTradingJob.js's own console.log),
 * so there was no way to see e.g. a learned-edge veto fire without watching the terminal
 * at the exact moment. Polls GET /ai/activity.
 */
export function AutoTradeActivityFeed() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const data = await aiService.activity(50);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePolling(load, 15000);

  if (error) return <div className="py-4 text-center text-sm text-danger">{error}</div>;
  if (!items) return <div className="py-4 text-center text-sm text-muted">Loading…</div>;
  if (!items.length) {
    return (
      <div className="py-6 text-center text-sm text-muted">
        No auto-trading activity yet — this fills in as soon as the 30s tick runs (needs auto-trading + market hours).
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
      {items.map((it) => (
        <div key={it._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-bg/30 px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-xs text-muted">{formatTime(it.tickAt)}</span>
            <span className="shrink-0 font-semibold">{it.symbol}</span>
            {it.action && <span className="shrink-0 text-xs text-muted">{it.action}</span>}
            <span
              title={it.reason || undefined}
              className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[it.status] ?? 'text-muted border-border/60'}`}
            >
              {humanize(it.status)}
            </span>
          </div>
          <div className="shrink-0 text-xs text-muted">
            {it.confidence != null && <span>{it.confidence}% conf</span>}
            {it.opportunityScore != null && <span className="ml-2">opp {it.opportunityScore}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

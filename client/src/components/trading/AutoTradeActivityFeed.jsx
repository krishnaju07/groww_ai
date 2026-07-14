import { useMemo, useState } from 'react';
import { aiService } from '../../services/ai.service.js';
import { usePolling } from '../../hooks/usePolling.js';

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

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'FILLED', label: 'Filled', match: (s) => s === 'FILLED' },
  { key: 'BLOCKED', label: 'Blocked', match: (s) => s === 'BLOCKED' || s === 'CONTEXT_FETCH_FAILED' },
  { key: 'SKIPPED', label: 'Skipped', match: (s) => s.startsWith('SKIPPED') },
];

function humanize(status) {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function formatTick(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Mon-Fri 09:15-15:30 IST, mirroring the server's isMarketOpen() — used only to pick a
 * client poll rate (fast while the 30s tick is actually producing new rows, slow the rest
 * of the day), never to hide/gate anything the server already decided.
 */
function isIstMarketHours(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  if (map.weekday === 'Sat' || map.weekday === 'Sun') return false;
  const mins = Number(map.hour) * 60 + Number(map.minute);
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

/**
 * Collapses consecutive same symbol+status rows (list is newest-first) into one row with
 * a repeat count. A learned-edge veto or a stuck trading-window skip firing every tick for
 * an hour is one line with "×120", not 120 near-identical rows burying the one order that
 * actually filled. Grouped on symbol+status rather than the full reason text, since reason
 * strings often embed live numbers (EV, trade count) that change tick to tick even though
 * the underlying cause hasn't — the newest occurrence's reason is kept as the tooltip.
 */
function groupConsecutive(items) {
  const groups = [];
  for (const it of items) {
    const prev = groups[groups.length - 1];
    if (prev && prev.symbol === it.symbol && prev.status === it.status) {
      prev.count += 1;
      prev.lastAt = it.tickAt;
    } else {
      groups.push({ ...it, count: 1, firstAt: it.tickAt, lastAt: it.tickAt });
    }
  }
  return groups;
}

/**
 * "What is the auto-trader actually doing right now" — every decision from the 30s tick
 * (equity + options), including the ones that never became an order. Before this existed,
 * that information only ever hit the server console (autoTradingJob.js's own console.log),
 * so there was no way to see e.g. a learned-edge veto fire without watching the terminal
 * at the exact moment. Polls GET /ai/activity, faster during market hours than after close.
 */
export function AutoTradeActivityFeed() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [pollMs, setPollMs] = useState(10000);
  const [filter, setFilter] = useState('ALL');

  async function load() {
    try {
      const data = await aiService.activity(50);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPollMs(isIstMarketHours(new Date()) ? 10000 : 45000);
    }
  }

  usePolling(load, pollMs);

  const counts = useMemo(() => {
    const c = { FILLED: 0, BLOCKED: 0, SKIPPED: 0, total: items?.length ?? 0 };
    for (const it of items ?? []) {
      if (it.status === 'FILLED') c.FILLED += 1;
      else if (it.status === 'BLOCKED' || it.status === 'CONTEXT_FETCH_FAILED') c.BLOCKED += 1;
      else c.SKIPPED += 1;
    }
    return c;
  }, [items]);

  const groups = useMemo(() => groupConsecutive(items ?? []), [items]);

  const visible = useMemo(() => {
    const f = FILTERS.find((f) => f.key === filter);
    return f?.match ? groups.filter((g) => f.match(g.status)) : groups;
  }, [groups, filter]);

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
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const n = f.key === 'ALL' ? counts.total : counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                filter === f.key ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border/50 text-muted hover:text-text'
              }`}
            >
              {f.label} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
        <span className="ml-auto shrink-0 text-[10px] text-muted">
          {isIstMarketHours(new Date()) ? 'live · polling 10s' : 'market closed · polling 45s'}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">No {filter.toLowerCase()} activity in the recent window.</div>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
          {visible.map((g) => (
            <div
              key={g._id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-bg/30 px-2.5 py-1.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {g.count > 1 ? `${formatTick(g.lastAt)}–${formatTick(g.firstAt)}` : formatTick(g.firstAt)}
                </span>
                <span className="shrink-0 font-semibold">{g.symbol}</span>
                {g.action && <span className="shrink-0 text-xs text-muted">{g.action}</span>}
                <span
                  title={g.reason || undefined}
                  className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[g.status] ?? 'text-muted border-border/60'}`}
                >
                  {humanize(g.status)}
                </span>
                {g.count > 1 && (
                  <span
                    title={`Fired ${g.count} ticks in a row`}
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                      g.count >= 5 ? 'border-warn/40 text-warn' : 'border-border/60 text-muted'
                    }`}
                  >
                    ×{g.count}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-xs text-muted">
                {g.confidence != null && <span>{g.confidence}% conf</span>}
                {g.opportunityScore != null && <span className="ml-2">opp {g.opportunityScore}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

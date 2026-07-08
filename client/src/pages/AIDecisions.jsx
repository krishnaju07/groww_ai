import { useState, useEffect } from 'react';
import { useAIStore } from '../store/useAIStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { Card } from '../components/common/Card.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { StatTile } from '../components/common/StatTile.jsx';
import { IndicatorBreakdown } from '../components/common/IndicatorBreakdown.jsx';
import { aiService } from '../services/ai.service.js';
import { formatDateTime, formatPercent, formatINR } from '../lib/format.js';

const TONE = { BUY: 'accent', SELL: 'danger', WAIT: 'default' };
const FILTERS = ['ALL', 'BUY', 'SELL', 'WAIT'];
const SCORE_LABELS = {
  trendConfluence: 'Trend confluence',
  momentum: 'Momentum',
  volumeConviction: 'Volume conviction',
  newsSentiment: 'News sentiment',
  trackRecord: 'Track record',
};

function ScoreBreakdown({ scores }) {
  if (!scores) return null;
  return (
    <div className="space-y-1.5 rounded-xl border border-border/60 bg-bg/30 p-3 text-xs">
      {Object.entries(SCORE_LABELS).map(([key, label]) => {
        const value = scores[key];
        if (value == null) return null;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-32 shrink-0 text-muted">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
              <div
                className={`h-full rounded-full ${value >= 65 ? 'bg-accent' : value <= 35 ? 'bg-danger' : 'bg-muted'}`}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-medium">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AIDecisions() {
  const decisions = useAIStore((s) => s.decisions);
  const fetchDecisions = useAIStore((s) => s.fetchDecisions);
  const [filter, setFilter] = useState('ALL');
  const [expanded, setExpanded] = useState(null);
  const [stats, setStats] = useState(null);

  usePolling(() => fetchDecisions({ limit: 100 }), 10000);

  useEffect(() => {
    aiService.stats().then(setStats);
    const id = setInterval(() => aiService.stats().then(setStats), 15000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === 'ALL' ? decisions : decisions.filter((d) => d.action === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">AI Decisions</h1>
        <p className="text-sm text-muted">Full audit trail of every AI decision, including WAIT calls and risk-blocked trades.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="AI-Triggered Trades Closed" value={stats.totalClosed} format={(n) => n.toFixed(0)} />
          <StatTile
            label="Win Rate"
            value={stats.winRate}
            format={formatPercent}
            tone={stats.totalClosed === 0 ? 'default' : stats.winRate >= 50 ? 'accent' : 'danger'}
          />
          <StatTile label="Wins" value={stats.winCount} format={(n) => n.toFixed(0)} />
          <StatTile
            label="Avg P&L per Trade"
            value={stats.avgPnl}
            format={formatINR}
            tone={stats.totalClosed === 0 ? 'default' : stats.avgPnl >= 0 ? 'accent' : 'danger'}
          />
        </div>
      )}

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
            <div key={d._id} className="py-3 first:pt-0 last:pb-0">
              <button
                onClick={() => setExpanded(expanded === d._id ? null : d._id)}
                className="flex w-full flex-col gap-2 text-left md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{d.symbol}</span>
                    <Badge tone={TONE[d.action]}>{d.action}</Badge>
                    {d.action !== 'WAIT' && <span className="text-xs text-muted">{d.quantity} shares</span>}
                    {d.models?.length > 1 && (
                      <span className="text-xs text-muted">
                        ({d.models.map((m) => `${m.name}: ${m.action}`).join(' vs ')})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">{d.reason}</p>
                  {d.riskResult?.allowed === false && (
                    <p className="mt-1 text-xs text-danger">Blocked by risk manager: {d.riskResult.reason}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <div>{formatDateTime(d.createdAt)}</div>
                  <div className="mt-0.5">{d.confidence}% confidence</div>
                  <div className="mt-0.5 text-accent underline">{expanded === d._id ? 'Hide details' : 'Show details'}</div>
                </div>
              </button>
              {expanded === d._id && (
                <div className="mt-2 space-y-3">
                  {d.justification && <p className="text-sm text-muted">{d.justification}</p>}
                  <ScoreBreakdown scores={d.scoreBreakdown} />
                  <IndicatorBreakdown snapshot={d.indicatorsSnapshot} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

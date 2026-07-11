import { useEffect, useState } from 'react';
import { reportsService } from '../services/reports.service.js';
import { Card } from '../components/common/Card.jsx';
import { formatINR, formatPercent } from '../lib/format.js';

const PERIODS = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: '7 Days' },
  { key: 'monthly', label: '30 Days' },
];

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border/60 bg-bg/30 p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted/60">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function pnlTone(n) {
  return n > 0 ? 'text-accent' : n < 0 ? 'text-danger' : '';
}

function BucketTable({ title, rows, keyLabel = 'Condition' }) {
  if (!rows?.length) return null;
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">{keyLabel}</th>
              <th className="pb-2 font-medium">Trades</th>
              <th className="pb-2 font-medium">Win %</th>
              <th className="pb-2 font-medium">Avg P&amp;L</th>
              <th className="pb-2 font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/40">
                <td className="py-2 font-medium">{r.key}</td>
                <td className="py-2">{r.count}</td>
                <td className="py-2">{r.winRate}%</td>
                <td className={`py-2 ${pnlTone(r.avgPnl)}`}>{formatINR(r.avgPnl)}</td>
                <td className={`py-2 ${pnlTone(r.netPnl)}`}>{formatINR(r.netPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const VERDICT_STYLE = {
  GOOD_TRADE: 'text-accent border-accent/40',
  ACCEPTABLE: 'text-muted border-border/60',
  MISTAKE: 'text-danger border-danger/40',
};

export function Reports() {
  const [period, setPeriod] = useState('daily');
  const [report, setReport] = useState(null);
  const [learning, setLearning] = useState(null);
  const [critiques, setCritiques] = useState(null);

  useEffect(() => {
    reportsService.period(period).then(setReport).catch(() => setReport(null));
  }, [period]);

  useEffect(() => {
    reportsService.learning().then(setLearning).catch(() => setLearning(null));
    reportsService.critiques().then(setCritiques).catch(() => setCritiques(null));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted">Performance and what the AI has learned from its own trades.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border/70 bg-surface/50 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${period === p.key ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {report && (
        <Card>
          <div className="mb-4 font-display font-semibold">{PERIODS.find((p) => p.key === period)?.label} Summary</div>
          {report.totalClosed === 0 ? (
            <div className="py-6 text-center text-sm text-muted">No closed trades in this window yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Net P&L" value={formatINR(report.netPnl)} tone={pnlTone(report.netPnl)} />
              <Stat label="Win rate" value={`${report.winRate}%`} />
              <Stat label="Trades" value={report.totalClosed} />
              <Stat label="Profit factor" value={report.profitFactor === null ? '—' : report.profitFactor === Infinity ? '∞' : report.profitFactor} />
              <Stat label="Avg win" value={formatINR(report.avgWin)} tone="text-accent" />
              <Stat label="Avg loss" value={formatINR(report.avgLoss)} tone="text-danger" />
              <Stat label="Largest win" value={formatINR(report.largestWin)} tone="text-accent" />
              <Stat label="Largest loss" value={formatINR(report.largestLoss)} tone="text-danger" />
              <Stat label="AI trades" value={report.aiTradeCount} />
              <Stat label="AI accuracy" value={`${report.aiAccuracy}%`} />
              <Stat label="Best hour" value={report.bestHour ? `${report.bestHour.hour}:00 (${formatINR(report.bestHour.pnl)})` : '—'} tone="text-accent" />
              <Stat label="Worst hour" value={report.worstHour ? `${report.worstHour.hour}:00 (${formatINR(report.worstHour.pnl)})` : '—'} tone="text-danger" />
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-1 font-display font-semibold">Learning Engine</div>
        <p className="mb-4 text-xs text-muted">
          Which conditions the AI's closed trades actually made money under — the basis for improving future decisions.
        </p>
        {!learning || learning.sampleSize === 0 ? (
          <div className="py-6 text-center text-sm text-muted">{learning?.note ?? 'No closed AI trades yet — insights appear once the AI has a track record.'}</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="AI sample" value={`${learning.sampleSize} trades`} />
              <Stat label="AI win rate" value={`${learning.overall.winRate}%`} />
              <Stat label="Best regime" value={learning.bestCondition ? `${learning.bestCondition.key} (${learning.bestCondition.winRate}%)` : '—'} tone="text-accent" />
              <Stat label="Worst regime" value={learning.worstCondition ? `${learning.worstCondition.key} (${learning.worstCondition.winRate}%)` : '—'} tone="text-danger" />
            </div>
            <BucketTable title="By market regime" rows={learning.byRegime} keyLabel="Regime" />
            <BucketTable title="By option side" rows={learning.byOptionType} keyLabel="Side" />
            <BucketTable title="By confidence" rows={learning.byConfidence} keyLabel="Confidence" />
            <BucketTable title="By opportunity score" rows={learning.byOpportunity} keyLabel="Opp. score" />
            <BucketTable title="By entry hour" rows={learning.byHour} keyLabel="Hour (IST)" />
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-1 font-display font-semibold">AI Self-Critique</div>
        <p className="mb-4 text-xs text-muted">The AI's own review of each closed trade — what went right, what was a mistake, and the lesson.</p>
        {!critiques?.length ? (
          <div className="py-6 text-center text-sm text-muted">No AI trades reviewed yet — a critique is generated automatically as each AI trade closes.</div>
        ) : (
          <div className="space-y-2">
            {critiques.map((c) => (
              <div key={c._id} className="rounded-xl border border-border/50 bg-bg/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.symbol}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${VERDICT_STYLE[c.verdict] ?? ''}`}>{c.verdict.replace('_', ' ')}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted">{c.exitType}</span>
                  </div>
                  <span className={`text-sm font-bold ${pnlTone(c.pnl)}`}>{formatINR(c.pnl)}</span>
                </div>
                {c.lessons?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.lessons.map((l, i) => (
                      <li key={i} className="text-xs text-muted">• {l}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

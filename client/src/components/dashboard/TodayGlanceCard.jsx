import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { Card } from '../common/Card.jsx';
import { reportsService } from '../../services/reports.service.js';
import { usePolling } from '../../hooks/usePolling.js';
import { formatINR } from '../../lib/format.js';

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted/60">{label}</div>
      <div className={`mt-0.5 font-display text-lg font-bold ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function pnlTone(n) {
  return n > 0 ? 'text-accent' : n < 0 ? 'text-danger' : '';
}

/** Compact daily P&L/win-rate/AI-accuracy strip — the "profit at the end" glance-check for the command center. Links to the full Reports page. */
export function TodayGlanceCard() {
  const [report, setReport] = useState(null);
  usePolling(() => reportsService.period('daily').then(setReport).catch(() => {}), 20000);

  if (!report) return null;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-display font-semibold">
          <BarChart3 size={16} className="text-muted" />
          Today at a Glance
        </span>
        <Link to="/reports" className="text-xs text-accent hover:underline">
          Full report →
        </Link>
      </div>
      {report.totalClosed === 0 ? (
        <div className="py-3 text-center text-sm text-muted">No closed trades yet today.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Net P&L" value={formatINR(report.netPnl)} tone={pnlTone(report.netPnl)} />
          <Stat label="Win rate" value={`${report.winRate}%`} />
          <Stat label="Trades" value={report.totalClosed} />
          <Stat label="AI trades" value={report.aiTradeCount} />
          <Stat label="AI accuracy" value={`${report.aiAccuracy}%`} />
        </div>
      )}
    </Card>
  );
}

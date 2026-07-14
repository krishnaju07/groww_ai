import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '../common/Card.jsx';
import { Skeleton } from '../common/Skeleton.jsx';
import { AnimatedNumber } from '../common/AnimatedNumber.jsx';
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
  return n > 0 ? 'text-accent' : n < 0 ? 'text-danger' : 'text-text';
}

/** Today's headline P&L, front and center — plus win-rate/trades/AI-accuracy as supporting stats. Links to the full Reports page. */
export function TodayGlanceCard() {
  const [report, setReport] = useState(null);
  usePolling(() => reportsService.period('daily').then(setReport).catch(() => {}), 20000);

  if (!report) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-9 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </Card>
    );
  }

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
        <>
          <div className="flex items-center gap-2">
            {report.netPnl >= 0 ? (
              <TrendingUp size={22} className="text-accent" />
            ) : (
              <TrendingDown size={22} className="text-danger" />
            )}
            <div className={`font-display text-3xl font-bold tracking-tight sm:text-4xl ${pnlTone(report.netPnl)}`}>
              <AnimatedNumber value={report.netPnl} format={formatINR} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted/60">net today</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Win rate" value={`${report.winRate}%`} />
            <Stat label="Trades" value={report.totalClosed} />
            <Stat label="AI trades" value={report.aiTradeCount} />
            <Stat label="AI accuracy" value={`${report.aiAccuracy}%`} />
          </div>
        </>
      )}
    </Card>
  );
}

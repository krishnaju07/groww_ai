import { ShieldAlert } from 'lucide-react';
import { Card } from '../common/Card.jsx';
import { ConfidenceMeter } from '../common/ConfidenceMeter.jsx';
import { Skeleton } from '../common/Skeleton.jsx';
import { formatINR } from '../../lib/format.js';

export function RiskSummaryCard({ meter }) {
  if (!meter) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-[72px] w-[72px] rounded-full" />
          <div className="flex-1 space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </Card>
    );
  }
  const { score, cfg, tradesToday, realizedPnlToday } = meter;
  const gaugeColor = score >= 66 ? 'text-danger' : score >= 33 ? 'text-warn' : 'text-accent';
  const gaugeBg = score >= 66 ? 'bg-danger/10' : score >= 33 ? 'bg-warn/10' : 'bg-accent/10';

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 font-display font-semibold">
          <ShieldAlert size={16} className="text-muted" />
          Risk Meter
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${gaugeColor} ${gaugeBg}`}>
          {score >= 66 ? 'High' : score >= 33 ? 'Moderate' : 'Low'}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <ConfidenceMeter value={score} size={72} />
        <div className="flex-1 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Trades today</span>
            <span className="font-medium">
              {tradesToday} / {cfg.maxTradesPerDay}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Realized P&amp;L today</span>
            <span className={`font-medium ${realizedPnlToday >= 0 ? 'text-accent' : 'text-danger'}`}>{formatINR(realizedPnlToday)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Daily loss cap</span>
            <span className="font-medium">{formatINR(cfg.maxLossPerDay)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

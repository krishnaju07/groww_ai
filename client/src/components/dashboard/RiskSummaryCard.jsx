import { Card } from '../common/Card.jsx';
import { ConfidenceMeter } from '../common/ConfidenceMeter.jsx';
import { formatINR } from '../../lib/format.js';

export function RiskSummaryCard({ meter }) {
  if (!meter) return null;
  const { score, cfg, tradesToday, realizedPnlToday } = meter;
  const gaugeColor = score >= 66 ? 'text-danger' : score >= 33 ? 'text-warn' : 'text-accent';

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display font-semibold">Risk Meter</span>
        <span className={`text-xs font-semibold ${gaugeColor}`}>
          {score >= 66 ? 'High' : score >= 33 ? 'Moderate' : 'Low'}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <ConfidenceMeter value={score} size={72} />
        <div className="flex-1 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Trades today</span>
            <span>
              {tradesToday} / {cfg.maxTradesPerDay}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Realized P&amp;L today</span>
            <span className={realizedPnlToday >= 0 ? 'text-accent' : 'text-danger'}>{formatINR(realizedPnlToday)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Daily loss cap</span>
            <span>{formatINR(cfg.maxLossPerDay)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

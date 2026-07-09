import { Wallet, PiggyBank, Briefcase, LineChart } from 'lucide-react';
import { StatTile } from '../common/StatTile.jsx';
import { StatTileSkeleton } from '../common/Skeleton.jsx';
import { formatINRWhole } from '../../lib/format.js';

export function PortfolioSummaryBar({ portfolio }) {
  if (!portfolio) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }
  const pnlTone = portfolio.unrealizedPnl >= 0 ? 'accent' : 'danger';

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatTile label="Portfolio Equity" value={portfolio.equity} format={formatINRWhole} icon={Wallet} />
      <StatTile label="Available Capital" value={portfolio.availableCapital} format={formatINRWhole} icon={PiggyBank} />
      <StatTile label="Invested" value={portfolio.investedTotal} format={formatINRWhole} icon={Briefcase} />
      <StatTile
        label="Unrealized P&L"
        value={portfolio.unrealizedPnl}
        format={formatINRWhole}
        deltaPercent={portfolio.unrealizedPnlPercent}
        tone={pnlTone}
        icon={LineChart}
      />
    </div>
  );
}

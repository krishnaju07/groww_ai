import { Wallet, PiggyBank, Briefcase, LineChart, Layers } from 'lucide-react';
import { StatTile } from '../common/StatTile.jsx';
import { StatTileSkeleton } from '../common/Skeleton.jsx';
import { formatINRWhole } from '../../lib/format.js';

export function PortfolioSummaryBar({ portfolio }) {
  if (!portfolio) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }
  const pnlTone = portfolio.unrealizedPnl >= 0 ? 'accent' : 'danger';
  const positions = portfolio.positions ?? [];
  const openSymbols = positions.length
    ? [...new Set(positions.map((p) => p.symbol))].slice(0, 3).join(', ')
    : null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
      <StatTile
        label="Open Positions"
        value={positions.length}
        format={(n) => String(Math.round(n))}
        sub={openSymbols ?? 'None open'}
        icon={Layers}
      />
    </div>
  );
}

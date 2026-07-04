import { StatTile } from '../common/StatTile.jsx';
import { formatINRWhole, formatPercent } from '../../lib/format.js';

export function PortfolioSummaryBar({ portfolio }) {
  if (!portfolio) return null;
  const pnlTone = portfolio.unrealizedPnl >= 0 ? 'accent' : 'danger';

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatTile label="Portfolio Equity" value={portfolio.equity} format={formatINRWhole} />
      <StatTile label="Available Capital" value={portfolio.availableCapital} format={formatINRWhole} />
      <StatTile label="Invested" value={portfolio.investedTotal} format={formatINRWhole} />
      <StatTile
        label="Unrealized P&L"
        value={portfolio.unrealizedPnl}
        format={(n) => `${formatINRWhole(n)} (${formatPercent(portfolio.unrealizedPnlPercent)})`}
        tone={pnlTone}
      />
    </div>
  );
}

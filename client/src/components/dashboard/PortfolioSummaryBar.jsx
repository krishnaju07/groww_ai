import { Wallet, TrendingUp, Sigma, Banknote } from 'lucide-react';
import StatTile from '../common/StatTile';
import { formatINR, formatPercent } from '../../lib/format';

/**
 * Row of StatTiles summarising the portfolio.
 * @param {Object} props
 * @param {import('../../types').PortfolioSummary | null} props.summary
 * @returns {JSX.Element}
 */
export default function PortfolioSummaryBar({ summary }) {
  const s = summary || {
    totalValue: 0,
    dayPnl: 0,
    dayPnlPercent: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    cashBalance: 0,
  };

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label="Total Value"
        value={formatINR(s.totalValue)}
        icon={<Sigma size={18} />}
      />
      <StatTile
        label="Day P&L"
        value={formatINR(s.dayPnl)}
        delta={formatPercent(s.dayPnlPercent)}
        deltaPositive={s.dayPnl >= 0}
        icon={<TrendingUp size={18} />}
      />
      <StatTile
        label="Total P&L"
        value={formatINR(s.totalPnl)}
        delta={formatPercent(s.totalPnlPercent)}
        deltaPositive={s.totalPnl >= 0}
        icon={<Wallet size={18} />}
      />
      <StatTile
        label="Cash Balance"
        value={formatINR(s.cashBalance)}
        icon={<Banknote size={18} />}
      />
    </div>
  );
}

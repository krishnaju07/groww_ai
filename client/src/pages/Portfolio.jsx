import { usePortfolioStore } from '../store/usePortfolioStore.js';
import { useTradesStore } from '../store/useTradesStore.js';
import { useAISignalsStore } from '../store/useAISignalsStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { PortfolioSummaryBar } from '../components/dashboard/PortfolioSummaryBar.jsx';
import { PositionsTable } from '../components/trading/PositionsTable.jsx';
import { RecentTradesTable } from '../components/dashboard/RecentTradesTable.jsx';

export function Portfolio() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const fetchPortfolio = usePortfolioStore((s) => s.fetch);
  const trades = useTradesStore((s) => s.trades);
  const fetchTrades = useTradesStore((s) => s.fetch);
  const signals = useAISignalsStore((s) => s.signals);
  const fetchSignals = useAISignalsStore((s) => s.fetch);

  usePolling(fetchPortfolio, 5000);
  usePolling(fetchTrades, 8000);
  usePolling(fetchSignals, 30000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Portfolio</h1>
        <p className="text-sm text-muted">Your paper-trading positions and trade history.</p>
      </div>
      <PortfolioSummaryBar portfolio={portfolio} />
      <PositionsTable positions={portfolio?.positions} signals={signals} />
      <RecentTradesTable trades={trades} />
    </div>
  );
}

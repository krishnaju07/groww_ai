import { useEffect, useState } from 'react';
import { useStocksStore } from '../store/useStocksStore.js';
import { usePortfolioStore } from '../store/usePortfolioStore.js';
import { useAIStore } from '../store/useAIStore.js';
import { stocksService } from '../services/stocks.service.js';
import { usePolling } from '../hooks/usePolling.js';
import { StockSelector } from '../components/trading/StockSelector.jsx';
import { LivePriceChart } from '../components/dashboard/LivePriceChart.jsx';
import { SignalCard } from '../components/trading/SignalCard.jsx';
import { TradePanel } from '../components/trading/TradePanel.jsx';
import { PositionsTable } from '../components/trading/PositionsTable.jsx';

export function Trade() {
  const watchlist = useStocksStore((s) => s.watchlist);
  const fetchWatchlist = useStocksStore((s) => s.fetchWatchlist);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const fetchPortfolio = usePortfolioStore((s) => s.fetch);
  const askAI = useAIStore((s) => s.askAI);
  const deciding = useAIStore((s) => s.deciding);

  const [symbol, setSymbol] = useState('RELIANCE');
  const [candles, setCandles] = useState([]);
  const [decision, setDecision] = useState(null);

  usePolling(fetchWatchlist, 10000);
  usePolling(fetchPortfolio, 5000);

  useEffect(() => {
    stocksService.candles(symbol, '5m', 100).then(setCandles);
    setDecision(null);
    const id = setInterval(() => stocksService.candles(symbol, '5m', 100).then(setCandles), 15000);
    return () => clearInterval(id);
  }, [symbol]);

  const ltp = watchlist.find((s) => s.symbol === symbol)?.ltp;

  async function handleAskAI() {
    const d = await askAI(symbol);
    setDecision(d);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Trade</h1>
        <p className="text-sm text-muted">Analyze, ask Claude for a read, and place a paper order.</p>
      </div>

      <StockSelector stocks={watchlist} selected={symbol} onSelect={setSymbol} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <LivePriceChart symbol={symbol} candles={candles} />
          <SignalCard symbol={symbol} decision={decision} loading={!!deciding[symbol]} onAskAI={handleAskAI} />
        </div>
        <div>
          <TradePanel symbol={symbol} ltp={ltp} decision={decision} onOrderPlaced={fetchPortfolio} />
        </div>
      </div>

      <PositionsTable positions={portfolio?.positions} />
    </div>
  );
}

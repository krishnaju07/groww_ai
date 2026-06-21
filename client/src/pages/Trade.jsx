import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import MarketWatchlist from '../components/trading/MarketWatchlist';
import TradeChart from '../components/trading/TradeChart';
import SignalCard from '../components/trading/SignalCard';
import TradePanel from '../components/trading/TradePanel';
import AnimatedNumber from '../components/common/AnimatedNumber';
import useStocksStore from '../store/useStocksStore';
import useSettingsStore from '../store/useSettingsStore';
import usePortfolioStore from '../store/usePortfolioStore';
import useSignalsStore from '../store/useSignalsStore';
import { usePolling } from '../hooks/usePolling';
import { formatINR, formatPercent, pnlColorClass } from '../lib/format';
import { GLASS_CARD, GRADIENT_TEXT, LABEL, NUM, cx } from '../lib/ui';

/**
 * Trade page (route `/trade`). Owns the selected `symbol` and lifts it to every
 * pane. Loads the stock universe, user settings, portfolio, and AI signals (top
 * signals for the watchlist pills + the selected stock's full signal), with
 * light polling for live prices + portfolio. Renders a responsive 3-pane desk:
 * Watchlist | Center (header + chart + signal) | Order ticket.
 *
 * @returns {JSX.Element}
 */
export default function Trade() {
  const stocks = useStocksStore((s) => s.stocks);
  const stocksLoading = useStocksStore((s) => s.loading);
  const fetchStocks = useStocksStore((s) => s.fetchStocks);
  const stocksError = useStocksStore((s) => s.error);

  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const settingsError = useSettingsStore((s) => s.error);

  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio);

  const signals = useSignalsStore((s) => s.signals);
  const topSignals = useSignalsStore((s) => s.top);
  const signalsLoading = useSignalsStore((s) => s.loading);
  const fetchTop = useSignalsStore((s) => s.fetchTop);
  const fetchSignal = useSignalsStore((s) => s.fetchSignal);

  const [symbol, setSymbol] = useState('');

  // One-time fetches on mount (de-duped within the stores).
  useEffect(() => {
    fetchStocks();
    fetchSettings();
    fetchPortfolio();
    fetchTop().catch(() => {
      /* watchlist pills are optional */
    });
  }, [fetchStocks, fetchSettings, fetchPortfolio, fetchTop]);

  // Light polling for live prices + portfolio state.
  usePolling(fetchStocks, 10000);
  usePolling(fetchPortfolio, 10000);

  // Default the selection to the first stock once the universe arrives.
  useEffect(() => {
    if (!symbol && Array.isArray(stocks) && stocks.length > 0) {
      setSymbol(stocks[0].symbol);
    }
  }, [stocks, symbol]);

  // Fetch the full signal for the selected symbol when it's not cached.
  useEffect(() => {
    if (!symbol || signals[symbol]) return;
    fetchSignal(symbol).catch(() => {
      /* signal is optional; trading still works without it */
    });
  }, [symbol, signals, fetchSignal]);

  // Build a { [symbol]: AISignal } map from the per-symbol cache + top signals.
  const signalMap = useMemo(() => {
    /** @type {Record<string, import('../types').AISignal>} */
    const map = {};
    if (Array.isArray(topSignals)) {
      for (const s of topSignals) {
        if (s && s.symbol) map[s.symbol] = s;
      }
    }
    if (signals && typeof signals === 'object') {
      for (const key of Object.keys(signals)) {
        if (signals[key]) map[key] = signals[key];
      }
    }
    return map;
  }, [topSignals, signals]);

  const selectedStock = useMemo(
    () => (Array.isArray(stocks) ? stocks.find((s) => s.symbol === symbol) : null) || null,
    [stocks, symbol],
  );

  const error = stocksError || settingsError;
  const price = selectedStock ? selectedStock.price : 0;
  const change = selectedStock ? selectedStock.change : 0;
  const up = change >= 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className={cx('font-display text-2xl font-bold', GRADIENT_TEXT)}>Trade</h1>
        <p className="mt-1 text-sm text-muted">
          A live trading desk with AI signals — watchlist, chart, and one-click orders.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[300px_1fr_380px]">
        {/* Left — Watchlist (full width above the rest on lg, sidebar on xl) */}
        <aside className={cx(GLASS_CARD, 'h-fit p-4 lg:col-span-2 xl:col-span-1')}>
          <MarketWatchlist
            stocks={stocks}
            signals={signalMap}
            value={symbol}
            onSelect={setSymbol}
            loading={stocksLoading}
          />
        </aside>

        {/* Center — stock header + chart + AI signal */}
        <section className="flex flex-col gap-6">
          <div className={cx(GLASS_CARD, 'p-5')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold text-text">
                  {symbol || '—'}
                </h2>
                <p className="truncate text-sm text-muted">
                  {selectedStock ? selectedStock.name : 'Select a stock'}
                </p>
              </div>
              <div className="text-right">
                {price > 0 ? (
                  <AnimatedNumber
                    value={price}
                    format={formatINR}
                    className={cx('text-2xl font-bold', GRADIENT_TEXT)}
                  />
                ) : (
                  <span className={cx(NUM, 'text-2xl font-bold text-muted')}>—</span>
                )}
                {selectedStock && (
                  <div className={cx(NUM, 'text-sm font-semibold', pnlColorClass(change))}>
                    {up ? '▲' : '▼'} {formatINR(Math.abs(change))} (
                    {formatPercent(selectedStock.changePercent)})
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <TradeChart symbol={symbol} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className={cx(LABEL, 'px-1')}>AI Signal</h3>
            <SignalCard signal={signals[symbol] || null} loading={signalsLoading} />
          </div>
        </section>

        {/* Right — order ticket */}
        <div className="h-fit">
          <TradePanel symbol={symbol} onSymbolChange={setSymbol} />
        </div>
      </div>
    </div>
  );
}

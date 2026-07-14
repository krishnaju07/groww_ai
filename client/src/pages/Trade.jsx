import { useEffect, useState } from 'react';
import { useStocksStore } from '../store/useStocksStore.js';
import { usePortfolioStore } from '../store/usePortfolioStore.js';
import { useAIStore } from '../store/useAIStore.js';
import { useAISignalsStore } from '../store/useAISignalsStore.js';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { watchlistService } from '../services/watchlist.service.js';
import { usePolling } from '../hooks/usePolling.js';

const PROVIDER_LABEL = { openai: 'OpenAI', claude: 'Claude', gemini: 'Gemini', grok: 'Grok', perplexity: 'Perplexity' };
import { StockSelector } from '../components/trading/StockSelector.jsx';
import { OptionsSelector } from '../components/trading/OptionsSelector.jsx';
import { RegimeBadge } from '../components/trading/RegimeBadge.jsx';
import { LivePriceChart } from '../components/dashboard/LivePriceChart.jsx';
import { SignalCard } from '../components/trading/SignalCard.jsx';
import { TradePanel } from '../components/trading/TradePanel.jsx';
import { PositionsTable } from '../components/trading/PositionsTable.jsx';

const MODES = ['EQUITY', 'OPTIONS'];

export function Trade() {
  const watchlist = useStocksStore((s) => s.watchlist);
  const fetchWatchlist = useStocksStore((s) => s.fetchWatchlist);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const fetchPortfolio = usePortfolioStore((s) => s.fetch);
  const askAI = useAIStore((s) => s.askAI);
  const askAIOptions = useAIStore((s) => s.askAIOptions);
  const deciding = useAIStore((s) => s.deciding);
  const signals = useAISignalsStore((s) => s.signals);
  const fetchSignals = useAISignalsStore((s) => s.fetch);
  const settings = useSettingsStore((s) => s.settings);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const fetchSettings = useSettingsStore((s) => s.fetch);

  const [mode, setMode] = useState('EQUITY');
  const [symbol, setSymbol] = useState('RELIANCE');
  const [optionContract, setOptionContract] = useState(null);
  const [decision, setDecision] = useState(null);
  const [focusOptionUnderlyings, setFocusOptionUnderlyings] = useState([]);

  usePolling(fetchWatchlist, 10000);
  usePolling(fetchPortfolio, 5000);
  usePolling(fetchSignals, 30000);

  useEffect(() => {
    if (!settings) fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshOptionFocus() {
    watchlistService.get().then((data) => setFocusOptionUnderlyings(data.optionUnderlyings.map((u) => u.symbol)));
  }
  useEffect(() => {
    refreshOptionFocus();
  }, []);

  async function handleAddEquity(sym) {
    await watchlistService.addEquity(sym);
    // Awaited (not fire-and-forget) — StockSelector selects the newly-added symbol right
    // after this resolves, and the watchlist store is where TradePanel's LTP comes from;
    // without this the panel briefly shows no LTP for a just-added, just-selected symbol.
    await fetchWatchlist();
  }
  async function handleRemoveEquity(sym) {
    await watchlistService.removeEquity(sym);
    fetchWatchlist();
    if (symbol === sym) setSymbol(watchlist.find((s) => s.symbol !== sym)?.symbol ?? '');
  }
  async function handleToggleOptionFocus(sym) {
    if (focusOptionUnderlyings.includes(sym)) await watchlistService.removeOption(sym);
    else await watchlistService.addOption(sym);
    refreshOptionFocus();
  }

  const isOptions = mode === 'OPTIONS';
  const activeSymbol = isOptions ? optionContract?.tradingSymbol : symbol;
  // The chart is always of the UNDERLYING's own price action (that's what actually drives
  // the AI's directional read) — for options this differs from activeSymbol (the concrete
  // contract), which is why LivePriceChart takes a separate chartSymbol + displayLabel.
  const chartSymbol = isOptions ? optionContract?.spotSymbol ?? optionContract?.underlying : symbol;
  const markerFilter = isOptions ? { underlying: optionContract?.underlying } : { symbol };

  useEffect(() => {
    if (!activeSymbol) return;
    setDecision(null);
  }, [activeSymbol]);

  const ltp = isOptions ? optionContract?.premium : watchlist.find((s) => s.symbol === symbol)?.ltp;

  async function handleAskAI() {
    // Options decisions run on the underlying (e.g. NIFTY) — decideOptions() itself picks
    // CE vs PE and resolves the concrete contract, which may differ from whichever strike
    // the user currently has clicked in the chain picker. Sync the selection to match so
    // TradePanel's symbol/segment/lotSize/quantity stay consistent with what was actually decided.
    if (isOptions) {
      const d = await askAIOptions(optionContract.underlying, activeSymbol);
      setDecision(d);
      if (d.action === 'BUY' && d.tradingSymbol) {
        const side = d.optionType === 'CE' ? d.indicatorsSnapshot?.ce : d.indicatorsSnapshot?.pe;
        setOptionContract({
          underlying: d.underlying,
          spotSymbol: optionContract.spotSymbol,
          strike: d.strike,
          expiry: d.expiry,
          optionType: d.optionType,
          tradingSymbol: d.tradingSymbol,
          lotSize: d.lotSize,
          premium: side?.premium ?? optionContract.premium,
        });
      }
      return;
    }
    const d = await askAI(activeSymbol);
    setDecision(d);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Trade</h1>
          <p className="text-sm text-muted">
            Analyze, ask {PROVIDER_LABEL[settings?.aiProvider] ?? 'the AI'} for a read, and place a {tradingMode?.mode === 'live' ? 'real-money' : 'paper'} order.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RegimeBadge />
          <div className="flex gap-1 rounded-xl border border-border/70 bg-surface/50 p-1">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === m ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text'
              }`}
            >
              {m === 'EQUITY' ? 'Equity' : 'Options'}
            </button>
          ))}
          </div>
        </div>
      </div>

      {isOptions ? (
        <OptionsSelector
          selected={optionContract}
          onSelectContract={setOptionContract}
          focusUnderlyings={focusOptionUnderlyings}
          onToggleFocus={handleToggleOptionFocus}
        />
      ) : (
        <StockSelector
          stocks={watchlist}
          selected={symbol}
          onSelect={setSymbol}
          onAdd={handleAddEquity}
          onRemove={handleRemoveEquity}
          signals={signals}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <LivePriceChart symbol={chartSymbol} displayLabel={activeSymbol} markerFilter={markerFilter} />
          {activeSymbol && (
            <SignalCard symbol={activeSymbol} decision={decision} loading={!!deciding[activeSymbol]} onAskAI={handleAskAI} />
          )}
        </div>
        <div>
          {(!isOptions || optionContract) && (
            <TradePanel
              symbol={activeSymbol}
              ltp={ltp}
              decision={decision}
              onOrderPlaced={fetchPortfolio}
              segment={isOptions ? 'FNO' : 'CASH'}
              lotSize={isOptions ? optionContract?.lotSize : null}
            />
          )}
        </div>
      </div>

      <PositionsTable positions={portfolio?.positions} signals={signals} onExited={fetchPortfolio} />
    </div>
  );
}

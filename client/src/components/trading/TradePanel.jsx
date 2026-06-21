import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import StockSelector from './StockSelector';
import SignalCard from './SignalCard';
import INRInput from '../common/INRInput';
import Spinner from '../common/Spinner';
import AnimatedNumber from '../common/AnimatedNumber';
import Skeleton from '../common/Skeleton';
import useStocksStore from '../../store/useStocksStore';
import useSettingsStore from '../../store/useSettingsStore';
import useSignalsStore from '../../store/useSignalsStore';
import usePortfolioStore from '../../store/usePortfolioStore';
import { executeManualTrade } from '../../services/trades.service';
import { formatINR } from '../../lib/format';
import {
  GLASS_CARD,
  GLASS_PANEL,
  GRADIENT_TEXT,
  BTN_PRIMARY,
  LABEL,
  NUM,
  cx,
} from '../../lib/ui';

/**
 * TradePanel — full manual paper-trade form.
 *
 * Flow: pick a stock (live price shown) → choose BUY/SELL → enter an INR amount
 * bounded by the user's min/max settings → preview the share count → review the
 * AI SignalCard → confirm. Confirming calls `trades.service.executeManualTrade`,
 * refreshes `usePortfolioStore`, and surfaces a success or error message.
 *
 * Stocks, settings, and the per-symbol AI signal are read from their Zustand
 * stores (the Trade page is responsible for triggering the initial fetches).
 *
 * @returns {JSX.Element}
 */
export default function TradePanel() {
  const stocks = useStocksStore((s) => s.stocks);
  const stocksLoading = useStocksStore((s) => s.loading);

  const settings = useSettingsStore((s) => s.settings);

  const signals = useSignalsStore((s) => s.signals);
  const signalsLoading = useSignalsStore((s) => s.loading);
  const fetchSignal = useSignalsStore((s) => s.fetchSignal);

  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio);

  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState(/** @type {'BUY'|'SELL'} */ ('BUY'));
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(/** @type {{type:'success'|'error',message:string}|null} */ (null));

  const minInvestment = settings ? settings.minInvestment : 5000;
  const maxInvestment = settings ? settings.maxInvestment : 50000;

  // Default selection + default amount once stocks / settings arrive.
  useEffect(() => {
    if (!symbol && Array.isArray(stocks) && stocks.length > 0) {
      setSymbol(stocks[0].symbol);
    }
  }, [stocks, symbol]);

  useEffect(() => {
    if (settings && amount === 0) {
      setAmount(settings.minInvestment);
    }
  }, [settings, amount]);

  // Fetch the AI signal for the selected symbol.
  useEffect(() => {
    if (!symbol) return;
    if (signals[symbol]) return;
    fetchSignal(symbol).catch(() => {
      /* signal is optional; trading still works without it */
    });
  }, [symbol, signals, fetchSignal]);

  const selectedStock = useMemo(
    () => (Array.isArray(stocks) ? stocks.find((s) => s.symbol === symbol) : null) || null,
    [stocks, symbol],
  );

  const price = selectedStock ? selectedStock.price : 0;
  const signal = signals[symbol] || null;

  // Estimated whole-share count (matches server: floor(amount / price)).
  const estShares =
    price > 0 && Number.isFinite(amount) ? Math.floor(amount / price) : 0;

  const amountValid =
    Number.isFinite(amount) &&
    amount >= minInvestment &&
    amount <= maxInvestment;

  const canSubmit =
    Boolean(symbol) &&
    !submitting &&
    (action === 'SELL' || (amountValid && estShares >= 1));

  const handleSymbolChange = (next) => {
    setSymbol(next);
    setResult(null);
  };

  const handleActionChange = (next) => {
    setAction(next);
    setResult(null);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const trade = await executeManualTrade({
        symbol,
        action,
        investmentAmount: Number(amount),
      });
      await fetchPortfolio();
      const verb = trade.action === 'BUY' ? 'Bought' : 'Sold';
      setResult({
        type: 'success',
        message: `${verb} ${trade.quantity} ${trade.symbol} @ ${formatINR(
          trade.price,
        )} (${formatINR(trade.investmentAmount)})`,
      });
    } catch (err) {
      setResult({
        type: 'error',
        message: err && err.message ? err.message : 'Trade failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = action === 'BUY';

  if (stocksLoading && (!stocks || stocks.length === 0)) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={cx(GLASS_CARD, 'space-y-4 p-5')}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-11 w-full" rounded="rounded-xl" />
          <Skeleton className="h-12 w-full" rounded="rounded-xl" />
          <Skeleton className="h-11 w-full" rounded="rounded-xl" />
          <Skeleton className="h-11 w-full" rounded="rounded-xl" />
          <Skeleton className="h-11 w-full" rounded="rounded-xl" />
        </div>
        <div className={cx(GLASS_CARD, 'h-64 p-5')}>
          <Skeleton className="h-full w-full" rounded="rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Order ticket */}
      <div className={cx(GLASS_CARD, 'p-5')}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-text">
              Place Order
            </h3>
            <p className="mt-0.5 text-xs text-muted">Manual paper trade</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <StockSelector
            stocks={stocks}
            value={symbol}
            onChange={handleSymbolChange}
          />

          {/* Live price */}
          <div
            className={cx(
              GLASS_PANEL,
              'flex items-center justify-between px-4 py-3',
            )}
          >
            <span className={LABEL}>Live Price</span>
            {price > 0 ? (
              <AnimatedNumber
                value={price}
                format={formatINR}
                className={cx(
                  'text-lg font-bold',
                  GRADIENT_TEXT,
                )}
              />
            ) : (
              <span className={cx(NUM, 'text-lg font-bold text-muted')}>—</span>
            )}
          </div>

          {/* BUY / SELL segmented toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => handleActionChange('BUY')}
              className={cx(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                action === 'BUY'
                  ? 'bg-gradient-to-r from-[#00C853] to-[#00E676] text-[#04210F] shadow-[0_4px_16px_-4px_rgba(0,200,83,0.5)]'
                  : 'text-muted hover:text-text',
              )}
            >
              <TrendingUp size={16} strokeWidth={2.5} />
              BUY
            </button>
            <button
              type="button"
              onClick={() => handleActionChange('SELL')}
              className={cx(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                action === 'SELL'
                  ? 'bg-gradient-to-r from-danger to-[#FF7B7B] text-[#2A0B0B] shadow-[0_4px_16px_-4px_rgba(255,82,82,0.5)]'
                  : 'text-muted hover:text-text',
              )}
            >
              <TrendingDown size={16} strokeWidth={2.5} />
              SELL
            </button>
          </div>

          {isBuy ? (
            <>
              <INRInput
                value={amount}
                onChange={setAmount}
                min={minInvestment}
                max={maxInvestment}
                label="Investment Amount"
                placeholder="Enter amount"
              />

              {/* Shares preview chip */}
              <div
                className={cx(
                  GLASS_PANEL,
                  'flex items-center justify-between px-4 py-3',
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Layers size={14} className="text-accent/80" />
                  Estimated Shares
                </span>
                <span className={cx(NUM, 'text-sm font-bold text-text')}>
                  ≈ {estShares} {estShares === 1 ? 'share' : 'shares'}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-muted">
                Limits: {formatINR(minInvestment)} – {formatINR(maxInvestment)}.
                Whole shares only (fractional amounts are floored).
              </p>
            </>
          ) : (
            <div
              className={cx(
                GLASS_PANEL,
                'px-4 py-3.5 text-sm leading-relaxed text-muted',
              )}
            >
              A SELL closes your entire open position for{' '}
              <span className="font-semibold text-text">
                {symbol || 'this stock'}
              </span>
              . No amount needed.
            </div>
          )}

          {result && (
            <div
              className={cx(
                'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm',
                result.type === 'success'
                  ? 'border-accent/30 bg-accent/10 text-accent shadow-[0_0_24px_rgba(0,200,83,0.12)]'
                  : 'border-danger/30 bg-danger/10 text-danger shadow-[0_0_24px_rgba(255,82,82,0.12)]',
              )}
            >
              {result.type === 'success' ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
              )}
              <span>{result.message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className={cx(
              'w-full',
              isBuy
                ? BTN_PRIMARY
                : 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-danger to-[#FF7B7B] px-4 py-2.5 text-sm font-semibold text-[#2A0B0B] shadow-[0_4px_20px_-4px_rgba(255,82,82,0.5)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100',
            )}
          >
            {submitting && <Spinner size="sm" />}
            {submitting
              ? 'Placing…'
              : `Place ${action}${symbol ? ` ${symbol}` : ''}`}
          </button>
        </div>
      </div>

      {/* AI signal column */}
      <div className="flex flex-col gap-3">
        <h3 className={cx(LABEL, 'px-1')}>AI Signal</h3>
        <SignalCard signal={signal} loading={signalsLoading} />
      </div>
    </div>
  );
}

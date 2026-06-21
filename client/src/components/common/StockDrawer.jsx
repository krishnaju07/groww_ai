import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, LineChart } from 'lucide-react';
import useUiStore from '../../store/useUiStore';
import useStocksStore from '../../store/useStocksStore';
import useSignalsStore from '../../store/useSignalsStore';
import * as stocksService from '../../services/stocks.service';
import SignalCard from '../trading/SignalCard';
import AnimatedNumber from './AnimatedNumber';
import Sparkline from './Sparkline';
import Skeleton from './Skeleton';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import {
  cx,
  GLASS_CARD,
  GLASS_PANEL,
  BTN_PRIMARY,
  LABEL,
  NUM,
} from '../../lib/ui';

/**
 * StockDrawer — right slide-in detail panel shown when `useUiStore.drawerSymbol`
 * is set. Surfaces the live price + day change (from `useStocksStore`), a
 * sparkline of recent closes (`stocksService.getHistory`), the AI signal
 * (reusing `SignalCard` fed by `useSignalsStore.fetchSignal`), and a CTA that
 * jumps to the Trade page. Closes on backdrop click and Escape.
 *
 * @returns {JSX.Element}
 */
export default function StockDrawer() {
  const navigate = useNavigate();

  const symbol = useUiStore((s) => s.drawerSymbol);
  const closeStock = useUiStore((s) => s.closeStock);

  const stocks = useStocksStore((s) => s.stocks);

  const signals = useSignalsStore((s) => s.signals);
  const signalsLoading = useSignalsStore((s) => s.loading);
  const fetchSignal = useSignalsStore((s) => s.fetchSignal);

  const [history, setHistory] = useState(/** @type {number[]} */ ([]));
  const [historyLoading, setHistoryLoading] = useState(false);

  const open = Boolean(symbol);

  const stock = useMemo(
    () =>
      (Array.isArray(stocks) ? stocks.find((s) => s.symbol === symbol) : null) ||
      null,
    [stocks, symbol],
  );

  const signal = symbol ? signals[symbol] || null : null;

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeStock();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeStock]);

  // Fetch the AI signal for the symbol when the drawer opens (skip if cached).
  useEffect(() => {
    if (!symbol) return;
    if (signals[symbol]) return;
    fetchSignal(symbol).catch(() => {
      /* signal is optional — drawer still renders price + chart */
    });
  }, [symbol, signals, fetchSignal]);

  // Fetch recent history (closes) for the sparkline.
  useEffect(() => {
    if (!symbol) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistory([]);
    stocksService
      .getHistory(symbol, 30)
      .then((candles) => {
        if (cancelled) return;
        const closes = Array.isArray(candles)
          ? candles.map((c) => c.close).filter((n) => Number.isFinite(n))
          : [];
        setHistory(closes);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const change = stock ? stock.change : 0;
  const changePercent = stock ? stock.changePercent : 0;
  const up = (change ?? 0) >= 0;

  const handleOpenInTrade = () => {
    navigate('/trade');
    closeStock();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cx(
          'fixed inset-0 z-[54] bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open
            ? 'opacity-100 animate-fade-in'
            : 'pointer-events-none opacity-0',
        )}
        onClick={closeStock}
        role="presentation"
        aria-hidden={!open}
      />

      {/* Panel */}
      <aside
        className={cx(
          'fixed inset-y-0 right-0 z-[55] flex w-full flex-col overflow-y-auto border-l border-white/[0.08] bg-bg/95 backdrop-blur-xl shadow-card transition-transform duration-300 sm:w-[420px]',
          GLASS_CARD,
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={symbol ? `${symbol} details` : 'Stock details'}
        aria-hidden={!open}
        inert={!open ? '' : undefined}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.06] bg-bg/80 px-5 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div className={LABEL}>Stock</div>
            <h2 className="mt-0.5 truncate font-display text-lg font-bold text-text">
              {symbol || '—'}
            </h2>
            {stock && (
              <p className="truncate text-xs text-muted">{stock.name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={closeStock}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 p-5">
          {/* Price + change */}
          <div className={cx(GLASS_PANEL, 'flex items-end justify-between gap-3 px-4 py-4')}>
            <div>
              <div className={LABEL}>Last Price</div>
              {stock ? (
                <AnimatedNumber
                  value={stock.price}
                  format={formatINR}
                  className="mt-1 text-2xl font-bold text-text"
                />
              ) : (
                <span className={cx(NUM, 'mt-1 block text-2xl font-bold text-muted')}>
                  —
                </span>
              )}
            </div>
            <div
              className={cx(
                NUM,
                'pb-1 text-sm font-semibold',
                pnlColorClass(change),
              )}
            >
              {up ? '▲' : '▼'} {formatINR(change)} ({formatPercent(changePercent)})
            </div>
          </div>

          {/* Sparkline of recent closes */}
          <div className={cx(GLASS_PANEL, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-1.5">
              <LineChart size={13} className="text-muted/80" />
              <span className={LABEL}>30-Day Trend</span>
            </div>
            {historyLoading ? (
              <Skeleton className="h-16 w-full" rounded="rounded-xl" />
            ) : history.length >= 2 ? (
              <Sparkline
                data={history}
                color={up ? '#00E676' : '#FF5252'}
                width={360}
                height={64}
                className="w-full"
              />
            ) : (
              <p className="py-4 text-center text-xs text-muted">
                No recent history.
              </p>
            )}
          </div>

          {/* AI signal — reuse the existing SignalCard */}
          <div className="flex flex-col gap-2">
            <span className={cx(LABEL, 'px-1')}>AI Signal</span>
            <SignalCard signal={signal} loading={signalsLoading && !signal} />
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleOpenInTrade}
            className={cx(BTN_PRIMARY, 'mt-auto w-full')}
          >
            Open in Trade
            <ArrowRight size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

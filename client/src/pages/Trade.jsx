import { useEffect } from 'react';
import { AlertCircle, Activity } from 'lucide-react';
import TradePanel from '../components/trading/TradePanel';
import Sparkline from '../components/common/Sparkline';
import Skeleton from '../components/common/Skeleton';
import useStocksStore from '../store/useStocksStore';
import useSettingsStore from '../store/useSettingsStore';
import { formatINR, formatPercent, pnlColorClass } from '../lib/format';
import {
  GLASS_CARD,
  GLASS_PANEL,
  GRADIENT_TEXT,
  LABEL,
  NUM,
  cx,
} from '../lib/ui';

/**
 * Trade page (route `/trade`). Loads the stock universe and user settings (the
 * investment min/max bounds the trade form), then renders the manual TradePanel.
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

  useEffect(() => {
    fetchStocks();
    fetchSettings();
  }, [fetchStocks, fetchSettings]);

  const error = stocksError || settingsError;
  const watchlist = Array.isArray(stocks) ? stocks : [];
  const showWatchlistSkeleton = stocksLoading && watchlist.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className={cx('font-display text-2xl font-bold', GRADIENT_TEXT)}>
          Trade
        </h1>
        <p className="mt-1 text-sm text-muted">
          Place manual paper trades with live AI signals.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <TradePanel />

        {/* Live market watchlist */}
        <aside className={cx(GLASS_CARD, 'h-fit p-5')}>
          <div className="mb-4 flex items-center gap-2">
            <Activity size={15} className="text-accent" />
            <h3 className={LABEL}>Live Market</h3>
          </div>

          {showWatchlistSkeleton ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" rounded="rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {watchlist.map((s) => {
                const up = s.change >= 0;
                return (
                  <div
                    key={s.symbol}
                    className={cx(
                      GLASS_PANEL,
                      'flex items-center justify-between gap-2 px-3 py-2.5',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text">
                        {s.symbol}
                      </div>
                      <div className="truncate text-[11px] text-muted">
                        {s.name}
                      </div>
                    </div>
                    <Sparkline
                      data={[
                        s.previousClose,
                        s.open,
                        s.low,
                        s.high,
                        s.price,
                      ].filter((n) => Number.isFinite(n))}
                      color={up ? '#00E676' : '#FF5252'}
                      width={56}
                      height={24}
                      dot={false}
                    />
                    <div className="shrink-0 text-right">
                      <div className={cx(NUM, 'text-sm font-bold text-text')}>
                        {formatINR(s.price)}
                      </div>
                      <div
                        className={cx(
                          NUM,
                          'text-[11px] font-semibold',
                          pnlColorClass(s.change),
                        )}
                      >
                        {up ? '▲' : '▼'} {formatPercent(s.changePercent)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

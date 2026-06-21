import { useCallback, useState } from 'react';
import { Wallet, TrendingUp, Banknote, AlertCircle } from 'lucide-react';
import PositionsTable from '../components/trading/PositionsTable';
import AnimatedNumber from '../components/common/AnimatedNumber';
import Skeleton from '../components/common/Skeleton';
import usePortfolioStore from '../store/usePortfolioStore';
import { usePolling } from '../hooks/usePolling';
import { executeManualTrade } from '../services/trades.service';
import { formatINR, formatPercent, pnlColorClass } from '../lib/format';
import {
  GLASS_CARD,
  GLASS_CARD_HOVER,
  GRADIENT_TEXT,
  LABEL,
  NUM,
  PILL,
  cx,
} from '../lib/ui';

/**
 * Portfolio page (route `/portfolio`). Shows portfolio summary tiles and the
 * open-positions table. Polls every 10s via `usePortfolioStore`. The Close
 * action closes the entire position through a manual SELL trade, then refreshes.
 *
 * @returns {JSX.Element}
 */
export default function Portfolio() {
  const summary = usePortfolioStore((s) => s.summary);
  const positions = usePortfolioStore((s) => s.positions);
  const loading = usePortfolioStore((s) => s.loading);
  const error = usePortfolioStore((s) => s.error);
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio);

  const [closing, setClosing] = useState(/** @type {string|null} */ (null));
  const [closeError, setCloseError] = useState(/** @type {string|null} */ (null));

  // Poll every 10s (also fires immediately on mount).
  usePolling(fetchPortfolio, 10_000, [fetchPortfolio]);

  const handleClose = useCallback(
    async (symbol) => {
      setClosing(symbol);
      setCloseError(null);
      try {
        await executeManualTrade({ symbol, action: 'SELL', investmentAmount: 0 });
        await fetchPortfolio();
      } catch (err) {
        setCloseError(
          err && err.message ? err.message : `Failed to close ${symbol}.`,
        );
      } finally {
        setClosing(null);
      }
    },
    [fetchPortfolio],
  );

  if (loading && !summary) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-44" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" rounded="rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" rounded="rounded-2xl" />
      </div>
    );
  }

  const totalPnl = summary ? summary.totalPnl : 0;
  const dayPnl = summary ? summary.dayPnl : 0;

  const tiles = [
    {
      label: 'Total Value',
      value: summary ? summary.totalValue : 0,
      Icon: Wallet,
      gradient: true,
    },
    {
      label: 'Total P&L',
      value: totalPnl,
      delta: summary ? formatPercent(summary.totalPnlPercent) : null,
      positive: totalPnl >= 0,
      Icon: TrendingUp,
    },
    {
      label: 'Day P&L',
      value: dayPnl,
      delta: summary ? formatPercent(summary.dayPnlPercent) : null,
      positive: dayPnl >= 0,
      Icon: TrendingUp,
    },
    {
      label: 'Cash Balance',
      value: summary ? summary.cashBalance : 0,
      Icon: Banknote,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cx('font-display text-2xl font-bold', GRADIENT_TEXT)}>
            Portfolio
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live positions, P&amp;L and trailing-stop status.
          </p>
        </div>
        <span
          className={cx(
            PILL,
            totalPnl >= 0
              ? 'bg-accent/12 text-accent border border-accent/25'
              : 'bg-danger/12 text-danger border border-danger/25',
          )}
        >
          <span className={NUM}>{formatPercent(summary ? summary.totalPnlPercent : 0)}</span>
          all-time
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={cx(GLASS_CARD_HOVER, 'p-5')}>
            <div className="flex items-start justify-between">
              <span className={LABEL}>{t.label}</span>
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted">
                <t.Icon size={15} />
              </span>
            </div>
            <AnimatedNumber
              value={t.value}
              format={formatINR}
              className={cx(
                'mt-3 block font-display text-2xl font-bold',
                t.gradient
                  ? GRADIENT_TEXT
                  : t.positive === undefined
                    ? 'text-text'
                    : pnlColorClass(t.value),
              )}
            />
            {t.delta && (
              <div className={cx(NUM, 'mt-1 text-xs font-semibold', pnlColorClass(t.value))}>
                {t.positive ? '▲' : '▼'} {t.delta}
              </div>
            )}
          </div>
        ))}
      </div>

      {closeError && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0" />
          {closeError}
        </div>
      )}

      {/* Positions */}
      <div className={cx(GLASS_CARD, 'p-5')}>
        <div className="mb-4">
          <h3 className="font-display text-base font-bold text-text">
            Open Positions
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Live P&amp;L · trailing-stop status · close to realize
          </p>
        </div>
        <PositionsTable
          positions={positions}
          onClose={handleClose}
          closing={closing}
        />
      </div>
    </div>
  );
}

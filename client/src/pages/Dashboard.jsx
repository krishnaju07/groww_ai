import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { getDashboard } from '../services/dashboard.service';
import { usePolling } from '../hooks/usePolling';
import Card from '../components/common/Card';
import Skeleton from '../components/common/Skeleton';
import PortfolioSummaryBar from '../components/dashboard/PortfolioSummaryBar';
import EquityCurve from '../components/dashboard/EquityCurve';
import SignalPanel from '../components/dashboard/SignalPanel';
import RecentTradesTable from '../components/dashboard/RecentTradesTable';
import AutoStatusCards from '../components/dashboard/AutoStatusCards';
import { GLASS_CARD, GRADIENT_TEXT, PILL, cx } from '../lib/ui';

/**
 * Skeleton placeholders matching the dashboard layout for the first load.
 * @returns {JSX.Element}
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cx(GLASS_CARD, 'p-5')}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className={cx(GLASS_CARD, 'p-5')}>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-64 w-full" rounded="rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={cx(GLASS_CARD, 'p-5')}>
          <Skeleton className="h-3 w-24" />
          <div className="mt-4 flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
          <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
        </div>
      </div>
      <div className={cx(GLASS_CARD, 'p-5')}>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-48 w-full" rounded="rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Dashboard page (route `/`). Loads aggregated DashboardData on mount, then polls
 * every 10s. Renders the five dashboard sections; shows Skeleton placeholders on
 * first load and an inline error banner on failure.
 * @returns {JSX.Element}
 */
export default function Dashboard() {
  /** @type {[import('../types').DashboardData | null, Function]} */
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const next = await getDashboard();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(load, 10_000, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cx('font-display text-2xl font-bold tracking-tight', GRADIENT_TEXT)}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your portfolio, AI signals and recent activity at a glance.
          </p>
        </div>
        <span
          className={cx(
            PILL,
            'border border-accent/30 bg-accent/12 text-accent animate-glow-pulse',
          )}
        >
          <Activity size={13} strokeWidth={2.5} />
          Live
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger backdrop-blur-md">
          {error}
        </div>
      )}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <PortfolioSummaryBar summary={data ? data.summary : null} />

          <Card title="Equity Curve" subtitle="Portfolio value over time">
            <EquityCurve data={data ? data.equityCurve : []} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Top Signals" subtitle="Highest-confidence AI calls">
              <SignalPanel signals={data ? data.topSignals : []} />
            </Card>
            <AutoStatusCards
              autoInvest={data ? data.autoInvest : { enabled: false }}
              autoExit={data ? data.autoExit : { enabled: false, activeRules: 0 }}
            />
          </div>

          <Card title="Recent Trades" subtitle="Last 10 executions">
            <RecentTradesTable trades={data ? data.recentTrades : []} />
          </Card>
        </>
      )}
    </div>
  );
}

import { useEffect, useId, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LineChart } from 'lucide-react';
import * as stocksService from '../../services/stocks.service';
import { formatINR } from '../../lib/format';
import Skeleton from '../common/Skeleton';
import { GLASS_PANEL, NUM, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').Candle} Candle
 */

/** Timeframe → lookback in days. */
const TIMEFRAMES = [
  { key: '1W', days: 7 },
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
];

/**
 * Format an ISO/"YYYY-MM-DD" date string into a short label (e.g. "21 Jun").
 * @param {string} iso
 * @returns {string}
 */
function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/**
 * Custom dark glass tooltip showing date + closing price.
 * @param {{ active?: boolean, payload?: Array<{ value: number, payload: { date: string, close: number } }>, accent?: string }} props
 * @returns {JSX.Element|null}
 */
function ChartTooltip({ active, payload, accent }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const tint = accent === '#FF5252' ? 'border-danger/25' : 'border-accent/20';
  return (
    <div
      className={cx(
        GLASS_PANEL,
        tint,
        'px-3 py-2 shadow-[0_8px_28px_-8px_rgba(0,0,0,0.6)]',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {shortDate(point.payload.date)}
      </p>
      <p className={cx(NUM, 'mt-0.5 text-sm font-bold text-text')}>
        {formatINR(point.value)}
      </p>
    </div>
  );
}

/**
 * TradeChart — price history area chart with selectable timeframe (1W/1M/3M).
 * Fetches candles via `stocksService.getHistory`, maps to `{ date, close }`,
 * and renders an accent-green (or red when the period declined) gradient area
 * with a glowing line and a glass tooltip. Shows Skeleton while loading and a
 * styled empty state when there is no data.
 *
 * @param {Object} props
 * @param {string} props.symbol  Canonical symbol whose history to chart.
 * @returns {JSX.Element}
 */
export default function TradeChart({ symbol }) {
  const [timeframe, setTimeframe] = useState('1M');
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const gid = useId().replace(/[:]/g, '');

  const days = TIMEFRAMES.find((t) => t.key === timeframe)?.days ?? 30;

  useEffect(() => {
    if (!symbol) {
      setCandles([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    stocksService
      .getHistory(symbol, days)
      .then((data) => {
        if (cancelled) return;
        setCandles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setCandles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, days]);

  const points = useMemo(
    () =>
      (Array.isArray(candles) ? candles : [])
        .filter((c) => c && Number.isFinite(c.close))
        .map((c) => ({ date: c.date, close: c.close })),
    [candles],
  );

  const declined = points.length >= 2 && points[points.length - 1].close < points[0].close;
  const accent = declined ? '#FF5252' : '#00C853';
  const line = declined ? '#FF5252' : '#00E676';
  const areaId = `tradeArea-${gid}`;
  const glowId = `tradeGlow-${gid}`;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-end gap-1.5" role="tablist" aria-label="Timeframe">
        {TIMEFRAMES.map((t) => {
          const active = t.key === timeframe;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTimeframe(t.key)}
              className={cx(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                active
                  ? 'border border-accent/30 bg-accent/12 text-accent'
                  : 'border border-white/10 bg-white/[0.03] text-muted hover:border-white/20 hover:text-text',
              )}
            >
              {t.key}
            </button>
          );
        })}
      </div>

      {loading && points.length === 0 ? (
        <Skeleton className="h-[220px] w-full" rounded="rounded-xl" />
      ) : points.length === 0 ? (
        <div className="flex h-[220px] w-full flex-col items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-muted">
            <LineChart size={22} />
          </span>
          <p className="text-sm font-medium text-muted">No chart data</p>
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
                  <stop offset="60%" stopColor={accent} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={line} floodOpacity="0.5" />
                </filter>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#FFFFFF"
                strokeOpacity={0.04}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke="#8B97A7"
                tick={{ fontSize: 10, fill: '#8B97A7' }}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
                hide
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                content={<ChartTooltip accent={accent} />}
                cursor={{
                  stroke: accent,
                  strokeWidth: 1,
                  strokeOpacity: 0.4,
                  strokeDasharray: '4 4',
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={line}
                strokeWidth={2}
                fill={`url(#${areaId})`}
                dot={false}
                activeDot={{ r: 4, fill: line, stroke: '#0A0D12', strokeWidth: 2 }}
                style={{ filter: `url(#${glowId})` }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

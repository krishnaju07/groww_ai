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
import { formatINR } from '../../lib/format';
import { GLASS_PANEL, cx } from '../../lib/ui';

/**
 * Format an ISO date string into a short axis/tooltip label (e.g. "21 Jun").
 * @param {string} iso
 * @returns {string}
 */
function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/**
 * Custom dark glass tooltip for the equity curve.
 * @param {Object} props
 * @param {{ active?: boolean, payload?: Array<{ value: number, payload: import('../../types').EquityPoint }> }} props
 * @returns {JSX.Element|null}
 */
function EquityTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  return (
    <div
      className={cx(
        GLASS_PANEL,
        'border-accent/20 px-3 py-2 shadow-[0_8px_28px_-8px_rgba(0,200,83,0.35)]',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {shortDate(point.payload.date)}
      </p>
      <p className="num mt-0.5 text-sm font-bold text-text">{formatINR(point.value)}</p>
    </div>
  );
}

/**
 * Equity-curve area chart with an accent-green gradient fill and glowing line.
 * @param {Object} props
 * @param {import('../../types').EquityPoint[]} props.data
 * @returns {JSX.Element}
 */
export default function EquityCurve({ data }) {
  const points = Array.isArray(data) ? data : [];

  if (points.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-muted">
          <LineChart size={22} />
        </span>
        <p className="text-sm font-medium text-muted">No equity data yet</p>
        <p className="text-xs text-muted/70">Your portfolio value will chart here over time.</p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityAccentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00C853" stopOpacity={0.4} />
              <stop offset="60%" stopColor="#00C853" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#00C853" stopOpacity={0} />
            </linearGradient>
            <filter id="equityGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00E676" floodOpacity="0.55" />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#FFFFFF" strokeOpacity={0.04} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            stroke="#8B97A7"
            tick={{ fontSize: 11, fill: '#8B97A7' }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            stroke="#8B97A7"
            tick={{ fontSize: 11, fill: '#8B97A7' }}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(v) => formatINR(v)}
            domain={['auto', 'auto']}
          />
          <Tooltip
            content={<EquityTooltip />}
            cursor={{ stroke: '#00C853', strokeWidth: 1, strokeOpacity: 0.4, strokeDasharray: '4 4' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#00E676"
            strokeWidth={2}
            fill="url(#equityAccentGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#00E676', stroke: '#0A0D12', strokeWidth: 2 }}
            style={{ filter: 'url(#equityGlow)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

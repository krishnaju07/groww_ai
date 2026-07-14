import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card } from '../common/Card.jsx';
import { Skeleton } from '../common/Skeleton.jsx';
import { formatINRWhole, formatDateTime } from '../../lib/format.js';

/** @param {{data: object[]|null}} props `null` means "not fetched yet", `[]` means "fetched, nothing to plot". */
export function EquityCurve({ data }) {
  if (data == null) {
    return (
      <Card>
        <div className="mb-3 font-display font-semibold">Equity Curve</div>
        <Skeleton className="h-64 w-full sm:h-72 lg:h-80" />
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <div className="mb-3 font-display font-semibold">Equity Curve</div>
        <div className="flex h-64 items-center justify-center text-sm text-muted sm:h-72 lg:h-80">
          No closed trades yet — the curve fills in as trades close.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Equity Curve</div>
      <div className="h-64 w-full sm:h-72 lg:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00C853" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#00C853" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#222A33" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(t) => formatDateTime(t)}
              tick={{ fill: '#8B97A7', fontSize: 11 }}
              axisLine={{ stroke: '#222A33' }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => formatINRWhole(v)}
              tick={{ fill: '#8B97A7', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{ background: '#121821', border: '1px solid #222A33', borderRadius: 12 }}
              labelFormatter={(t) => formatDateTime(t)}
              formatter={(v) => [formatINRWhole(v), 'Equity']}
            />
            <Area type="monotone" dataKey="equity" stroke="#00C853" strokeWidth={2} fill="url(#equityGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

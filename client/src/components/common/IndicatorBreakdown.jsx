function formatGreeks(g) {
  if (!g) return undefined;
  return `Δ ${g.delta} · θ ₹${g.theta}/day · vega ${g.vega}${g.iv != null ? ` · IV ${g.iv}%` : ''}`;
}

/** Compact grid rendering of an AIDecisionLog.indicatorsSnapshot — "why" behind a call.
 * Options snapshots (contextBuilder.buildOptionsContext) carry `ce`/`pe`/`regime`/`chainIntel`
 * alongside the same underlying technicals equity snapshots have — rendered as an extra
 * options-specific block so premium/greeks/regime/chain-intel reasoning isn't invisible. */
export function IndicatorBreakdown({ snapshot }) {
  if (!snapshot) return <div className="text-xs text-muted">No indicator data recorded for this decision.</div>;

  const isOptions = Boolean(snapshot.ce || snapshot.pe);
  const optionRows = isOptions
    ? [
        ['Underlying / Strike', snapshot.strike != null ? `${snapshot.underlying ?? ''} ${snapshot.strike}` : undefined],
        ['Expiry', snapshot.expiry ? new Date(snapshot.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined],
        ['Market regime', snapshot.regime ? `${snapshot.regime.regime}${snapshot.regime.tradeable === false ? ' (stand aside)' : ''}` : undefined],
        ['CE premium', snapshot.ce?.premium != null ? `₹${snapshot.ce.premium}` : undefined],
        ['CE greeks', formatGreeks(snapshot.ce?.greeks)],
        ['PE premium', snapshot.pe?.premium != null ? `₹${snapshot.pe.premium}` : undefined],
        ['PE greeks', formatGreeks(snapshot.pe?.greeks)],
        [
          'Chain intel (PCR / Max Pain)',
          snapshot.chainIntel?.available ? `PCR ${snapshot.chainIntel.pcr} / Max Pain ${snapshot.chainIntel.maxPain}` : 'Unavailable (no live F&O data feed)',
        ],
        ['Minutes to square-off', snapshot.minutesToSquareOff],
        [
          'CE track record',
          snapshot.ce?.trackRecord?.totalClosed ? `${snapshot.ce.trackRecord.totalClosed} trade(s), ${snapshot.ce.trackRecord.winRate}% win rate` : undefined,
        ],
        [
          'PE track record',
          snapshot.pe?.trackRecord?.totalClosed ? `${snapshot.pe.trackRecord.totalClosed} trade(s), ${snapshot.pe.trackRecord.winRate}% win rate` : undefined,
        ],
      ].filter(([, v]) => v != null && v !== '')
    : [];

  const rows = [
    ['RSI (14)', snapshot.rsi],
    ['MACD histogram', snapshot.macd?.histogram],
    ['Volume vs avg', snapshot.volumeRatio != null ? `${snapshot.volumeRatio}x` : undefined],
    ['Trend (5m)', snapshot.trendShortTerm],
    ['Trend (15m)', snapshot.trendMediumTerm],
    ['Trend (30m)', snapshot.trendLongTerm],
    ['Parabolic SAR', snapshot.psar ? `${snapshot.psar.trend} (₹${snapshot.psar.value})` : undefined],
    ['Supertrend', snapshot.supertrend ? `${snapshot.supertrend.trend} (₹${snapshot.supertrend.value})` : undefined],
    ['ATR (volatility)', snapshot.atr != null ? `₹${snapshot.atr}` : undefined],
    ['Support / Resistance', snapshot.levels ? `₹${snapshot.levels.support} / ₹${snapshot.levels.resistance}` : undefined],
    ['Sector', snapshot.sector],
    ['Sector relative strength', snapshot.sectorRelativeStrength != null ? `${snapshot.sectorRelativeStrength > 0 ? '+' : ''}${snapshot.sectorRelativeStrength}%` : undefined],
    ['Nifty sentiment', snapshot.niftySentiment],
    isOptions
      ? [null, undefined] // options carries per-side track record instead (see optionRows above)
      : [
          'Track record',
          snapshot.trackRecord?.totalClosed
            ? `${snapshot.trackRecord.totalClosed} trade(s), ${snapshot.trackRecord.winRate}% win rate, avg ₹${snapshot.trackRecord.avgPnl}`
            : 'No closed trades yet',
        ],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <div className="space-y-3">
      {isOptions && optionRows.length > 0 && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-accent/30 bg-accent/[0.03] p-3 text-xs sm:grid-cols-2">
          {optionRows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-muted">{label}</span>
              <span className="text-right font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-bg/30 p-3 text-xs sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-muted">{label}</span>
            <span className="text-right font-medium">{String(value)}</span>
          </div>
        ))}
      </div>
      {snapshot.news?.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-bg/30 p-3 text-xs">
          <div className="mb-1.5 font-medium text-muted">News considered</div>
          <ul className="space-y-1">
            {snapshot.news.map((headline, i) => (
              <li key={i} className="text-muted">
                • {headline}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

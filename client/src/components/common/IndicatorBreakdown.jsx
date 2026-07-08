/** Compact grid rendering of an AIDecisionLog.indicatorsSnapshot — "why" behind a call. */
export function IndicatorBreakdown({ snapshot }) {
  if (!snapshot) return <div className="text-xs text-muted">No indicator data recorded for this decision.</div>;

  const rows = [
    ['RSI (14)', snapshot.rsi],
    ['MACD histogram', snapshot.macd?.histogram],
    ['Volume vs avg', snapshot.volumeRatio != null ? `${snapshot.volumeRatio}x` : undefined],
    ['Trend (5m)', snapshot.trendShortTerm],
    ['Trend (15m)', snapshot.trendMediumTerm],
    ['Trend (30m)', snapshot.trendLongTerm],
    ['Parabolic SAR', snapshot.psar ? `${snapshot.psar.trend} (₹${snapshot.psar.value})` : undefined],
    ['Supertrend', snapshot.supertrend ? `${snapshot.supertrend.trend} (₹${snapshot.supertrend.value})` : undefined],
    ['Support / Resistance', snapshot.levels ? `₹${snapshot.levels.support} / ₹${snapshot.levels.resistance}` : undefined],
    ['Sector', snapshot.sector],
    ['Sector relative strength', snapshot.sectorRelativeStrength != null ? `${snapshot.sectorRelativeStrength > 0 ? '+' : ''}${snapshot.sectorRelativeStrength}%` : undefined],
    ['Nifty sentiment', snapshot.niftySentiment],
    [
      'Track record',
      snapshot.trackRecord?.totalClosed
        ? `${snapshot.trackRecord.totalClosed} trade(s), ${snapshot.trackRecord.winRate}% win rate, avg ₹${snapshot.trackRecord.avgPnl}`
        : 'No closed trades yet',
    ],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <div className="space-y-3">
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

/** Compact grid rendering of an AIDecisionLog.indicatorsSnapshot — "why" behind a call. */
export function IndicatorBreakdown({ snapshot }) {
  if (!snapshot) return <div className="text-xs text-muted">No indicator data recorded for this decision.</div>;

  const rows = [
    ['RSI (14)', snapshot.rsi],
    ['MACD histogram', snapshot.macd?.histogram],
    ['Volume vs avg', snapshot.volumeRatio != null ? `${snapshot.volumeRatio}x` : undefined],
    ['Trend (5m)', snapshot.trendShortTerm],
    ['Trend (15m)', snapshot.trendMediumTerm],
    ['Support / Resistance', snapshot.levels ? `₹${snapshot.levels.support} / ₹${snapshot.levels.resistance}` : undefined],
    ['Sector', snapshot.sector],
    ['Sector relative strength', snapshot.sectorRelativeStrength != null ? `${snapshot.sectorRelativeStrength > 0 ? '+' : ''}${snapshot.sectorRelativeStrength}%` : undefined],
    ['Nifty sentiment', snapshot.niftySentiment],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-bg/30 p-3 text-xs sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <span className="text-muted">{label}</span>
          <span className="text-right font-medium">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

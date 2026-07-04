import { formatINR, formatPercent } from '../../lib/format.js';

/**
 * @param {{stocks:object[], selected:string, onSelect:(symbol:string)=>void}} props
 */
export function StockSelector({ stocks = [], selected, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {stocks.map((s) => (
        <button
          key={s.symbol}
          onClick={() => onSelect(s.symbol)}
          className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors ${
            selected === s.symbol
              ? 'border-accent/50 bg-accent/10 text-accent'
              : 'border-border/70 bg-surface/50 text-text hover:border-accent/30'
          }`}
        >
          <div className="text-sm font-semibold">{s.symbol}</div>
          <div className="text-xs text-muted">{s.ltp != null ? formatINR(s.ltp) : '—'}</div>
        </button>
      ))}
    </div>
  );
}

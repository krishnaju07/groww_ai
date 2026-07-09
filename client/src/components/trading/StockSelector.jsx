import { formatINR } from '../../lib/format.js';

const DOT_TONE = { BUY: 'bg-accent', SELL: 'bg-danger' };

/**
 * @param {{stocks:object[], selected:string, onSelect:(symbol:string)=>void, signals?:Record<string,{action:string,confidence:number}>}} props
 */
export function StockSelector({ stocks = [], selected, onSelect, signals = {} }) {
  return (
    <div className="flex flex-wrap gap-2">
      {stocks.map((s) => {
        const signal = signals[s.symbol];
        const dotTone = signal && DOT_TONE[signal.action];
        return (
          <button
            key={s.symbol}
            onClick={() => onSelect(s.symbol)}
            title={signal ? `AI: ${signal.action} (${signal.confidence}%)` : undefined}
            className={`relative shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors ${
              selected === s.symbol
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border/70 bg-surface/50 text-text hover:border-accent/30'
            }`}
          >
            {dotTone && <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${dotTone}`} />}
            <div className="text-sm font-semibold">{s.symbol}</div>
            <div className="text-xs text-muted">{s.ltp != null ? formatINR(s.ltp) : '—'}</div>
          </button>
        );
      })}
    </div>
  );
}

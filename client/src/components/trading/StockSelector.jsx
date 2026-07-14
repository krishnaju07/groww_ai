import { useEffect, useRef, useState } from 'react';
import { formatINR } from '../../lib/format.js';
import { stocksService } from '../../services/stocks.service.js';

const DOT_TONE = { BUY: 'bg-accent', SELL: 'bg-danger' };

/**
 * Focus-list pills (the user's personal watchlist) plus a search box to find and add
 * any other real NSE stock (~2,300 synced from Groww) — searching/selecting a result
 * both selects it for immediate trading and adds it to the focus list, since there's
 * no reason to search for a stock you don't want to look at again.
 * @param {{stocks:object[], selected:string, onSelect:(symbol:string)=>void, onAdd:(symbol:string)=>void, onRemove:(symbol:string)=>void, signals?:Record<string,{action:string,confidence:number}>}} props
 */
export function StockSelector({ stocks = [], selected, onSelect, onAdd, onRemove, signals = {} }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  // Guards against response reordering — if the user types fast, an earlier request
  // can resolve after a later one and would otherwise overwrite `results` with stale data.
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const requestId = ++latestRequestId.current;
    const id = setTimeout(() => {
      stocksService.search(query, 10).then((r) => {
        if (requestId !== latestRequestId.current) return; // a newer search already superseded this one
        setResults(r);
        setOpen(true);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function pick(symbol) {
    // Awaits the add (which refreshes the watchlist store) before selecting — selecting
    // first would leave TradePanel briefly without an LTP, since that's sourced from the
    // watchlist store by symbol match, not fetched independently.
    await onAdd(symbol);
    onSelect(symbol);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative max-w-xs">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search any NSE stock to add…"
          className="w-full rounded-xl border border-border/70 bg-surface/50 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/50 focus:outline-none"
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border/70 bg-surface shadow-lg">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => pick(r.symbol)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/10"
              >
                <span className="font-semibold">{r.symbol}</span>
                <span className="truncate pl-2 text-xs text-muted">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {stocks.map((s) => {
          const signal = signals[s.symbol];
          const dotTone = signal && DOT_TONE[signal.action];
          return (
            <div key={s.symbol} className="relative">
              <button
                onClick={() => onSelect(s.symbol)}
                title={signal ? `AI: ${signal.action} (${signal.confidence}%)` : undefined}
                className={`relative shrink-0 rounded-xl border px-4 py-2.5 pr-6 text-left transition-colors ${
                  selected === s.symbol
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border/70 bg-surface/50 text-text hover:border-accent/30'
                }`}
              >
                {dotTone && <span className={`absolute right-6 top-1.5 h-2 w-2 rounded-full ${dotTone}`} />}
                <div className="text-sm font-semibold">{s.symbol}</div>
                <div className="text-xs text-muted">{s.ltp != null ? formatINR(s.ltp) : '—'}</div>
              </button>
              {onRemove && (
                <button
                  onClick={() => onRemove(s.symbol)}
                  title={`Remove ${s.symbol} from your focus list`}
                  className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-xs text-muted hover:bg-danger/20 hover:text-danger"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

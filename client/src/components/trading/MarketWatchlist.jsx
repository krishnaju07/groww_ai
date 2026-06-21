import { useMemo, useState } from 'react';
import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Sparkline from '../common/Sparkline';
import Skeleton from '../common/Skeleton';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { GLASS_PANEL, PILL, LABEL, NUM, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').StockQuote} StockQuote
 * @typedef {import('../../types').AISignal} AISignal
 */

/**
 * Per-signal pill styling for the compact watchlist badge.
 * @type {Record<string, { className: string, Icon: React.ComponentType<{size?:number, strokeWidth?:number}> }>}
 */
const SIGNAL_PILL = {
  BUY: {
    className:
      'bg-accent/12 text-accent border border-accent/25',
    Icon: TrendingUp,
  },
  SELL: {
    className: 'bg-danger/12 text-danger border border-danger/25',
    Icon: TrendingDown,
  },
  HOLD: {
    className: 'bg-white/5 text-muted border border-white/10',
    Icon: Minus,
  },
};

/**
 * Compact signal pill (BUY/SELL/HOLD) for a watchlist row. Returns null when no
 * signal is available so the row simply omits it.
 * @param {{ signal?: ('BUY'|'SELL'|'HOLD') }} props
 * @returns {JSX.Element|null}
 */
function RowSignalPill({ signal }) {
  const config = SIGNAL_PILL[signal];
  if (!config) return null;
  const { className, Icon } = config;
  return (
    <span className={cx(PILL, 'px-1.5 py-0.5 text-[10px] leading-none', className)}>
      <Icon size={10} strokeWidth={2.5} />
      {signal}
    </span>
  );
}

/**
 * A single clickable watchlist row (glass panel button). Highlights when selected.
 * @param {Object} props
 * @param {StockQuote} props.stock
 * @param {AISignal|null|undefined} props.signal
 * @param {boolean} props.selected
 * @param {(symbol:string)=>void} props.onSelect
 * @returns {JSX.Element}
 */
function WatchlistRow({ stock, signal, selected, onSelect }) {
  const up = (stock.change ?? 0) >= 0;
  const spark = up ? '#00E676' : '#FF5252';

  return (
    <button
      type="button"
      onClick={() => onSelect(stock.symbol)}
      aria-pressed={selected}
      className={cx(
        GLASS_PANEL,
        'group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all',
        'hover:border-white/[0.12] hover:bg-white/[0.04]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        selected &&
          'border-accent/40 bg-accent/[0.06] ring-1 ring-accent/40 shadow-[0_0_18px_-6px_rgba(0,200,83,0.4)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-text">{stock.symbol}</span>
          <RowSignalPill signal={signal?.signal} />
        </div>
        <span className="block truncate text-xs text-muted">{stock.name}</span>
      </div>

      <div className="hidden shrink-0 sm:block">
        <Sparkline
          data={[stock.previousClose, stock.open, stock.low, stock.high, stock.price].filter(
            (n) => Number.isFinite(n),
          )}
          color={spark}
          width={48}
          height={22}
          strokeWidth={1.5}
          dot={false}
        />
      </div>

      <div className="shrink-0 text-right">
        <div className={cx(NUM, 'text-sm font-bold text-text')}>{formatINR(stock.price)}</div>
        <div className={cx(NUM, 'text-xs font-semibold', pnlColorClass(stock.change))}>
          {up ? '▲' : '▼'} {formatPercent(stock.changePercent)}
        </div>
      </div>
    </button>
  );
}

/**
 * MarketWatchlist — searchable live list of the stock universe with AI signal
 * pills, live price + day change, a tiny sparkline, and a highlighted selected
 * row. Scrollable on desktop. Pure presentational; guards missing data.
 *
 * @param {Object} props
 * @param {StockQuote[]} [props.stocks]                     Live universe quotes.
 * @param {Record<string, AISignal>} [props.signals]       Signal map keyed by symbol.
 * @param {string} [props.value]                           Selected canonical symbol.
 * @param {(symbol:string)=>void} props.onSelect           Called with the chosen symbol.
 * @param {boolean} [props.loading]                        Whether quotes are loading.
 * @returns {JSX.Element}
 */
export default function MarketWatchlist({
  stocks,
  signals,
  value,
  onSelect,
  loading = false,
}) {
  const [query, setQuery] = useState('');
  const rows = Array.isArray(stocks) ? stocks : [];
  const signalMap = signals && typeof signals === 'object' ? signals : {};
  const select = typeof onSelect === 'function' ? onSelect : () => {};

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => {
      const symbol = (s.symbol || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return symbol.includes(q) || name.includes(q);
    });
  }, [rows, query]);

  const showSkeleton = loading && rows.length === 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Watchlist</span>
        <span className={cx(NUM, 'text-[11px] text-muted')}>{rows.length}</span>
      </div>

      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or name…"
          aria-label="Search watchlist"
          className={cx(
            GLASS_PANEL,
            'w-full py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted/70 outline-none transition-all',
            'focus:border-accent/40 focus:ring-2 focus:ring-accent/40',
          )}
        />
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar xl:max-h-[calc(100vh-13rem)]">
        {showSkeleton ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] w-full" rounded="rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <div
            className={cx(
              GLASS_PANEL,
              'flex flex-col items-center justify-center gap-1 px-3 py-6 text-center',
            )}
          >
            <p className="text-sm text-muted">
              {rows.length === 0 ? 'No stocks available' : 'No matches'}
            </p>
            {rows.length > 0 && query && (
              <p className="text-xs text-muted/70">Try a different symbol or name.</p>
            )}
          </div>
        ) : (
          filtered.map((stock) => (
            <WatchlistRow
              key={stock.symbol}
              stock={stock}
              signal={signalMap[stock.symbol]}
              selected={stock.symbol === value}
              onSelect={select}
            />
          ))
        )}
      </div>
    </div>
  );
}

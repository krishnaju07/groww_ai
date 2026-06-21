import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  TrendingUp,
  LayoutDashboard,
  Wallet,
  Settings as SettingsIcon,
  FlaskConical,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import useUiStore from '../../store/useUiStore';
import useStocksStore from '../../store/useStocksStore';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { cx, GLASS_CARD, LABEL, NUM } from '../../lib/ui';

/**
 * Static navigation commands available in the palette. Each routes via the
 * react-router navigator and closes the palette on select.
 * @type {{label:string,to:string,icon:import('lucide-react').LucideIcon}[]}
 */
const NAV_COMMANDS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Portfolio', to: '/portfolio', icon: Wallet },
  { label: 'Trade', to: '/trade', icon: TrendingUp },
  { label: 'Settings', to: '/settings', icon: SettingsIcon },
  { label: 'Backtest', to: '/backtest', icon: FlaskConical },
];

/** How many stock results to show for an empty query. */
const TOP_STOCKS_EMPTY = 5;
/** Max stock results when filtering. */
const MAX_STOCK_RESULTS = 8;

/**
 * CommandPalette — global ⌘K command palette. Visibility is driven by
 * `useUiStore.paletteOpen` (toggled by the Layout keydown handler / Navbar). It
 * offers fuzzy stock search (opens the StockDrawer) and quick navigation.
 *
 * Keyboard: ↑/↓ move the highlight across the flattened result list, Enter runs
 * the highlighted item, Esc / backdrop click closes, typing filters.
 *
 * @returns {JSX.Element|null}
 */
export default function CommandPalette() {
  const navigate = useNavigate();

  const open = useUiStore((s) => s.paletteOpen);
  const closePalette = useUiStore((s) => s.closePalette);
  const openStock = useUiStore((s) => s.openStock);

  const stocks = useStocksStore((s) => s.stocks);
  const fetchStocks = useStocksStore((s) => s.fetchStocks);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Populate the universe if it hasn't been loaded yet (e.g. palette opened
  // before visiting a page that fetches stocks).
  useEffect(() => {
    if (open && (!Array.isArray(stocks) || stocks.length === 0)) {
      fetchStocks();
    }
  }, [open, stocks, fetchStocks]);

  // Reset query + highlight and focus the input each time the palette opens.
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActive(0);
    // Focus after paint so the autofocus lands reliably.
    const id = requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Build the filtered, grouped result set.
  const { stockResults, navResults } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = Array.isArray(stocks) ? stocks : [];

    let stockResults;
    if (!q) {
      stockResults = all.slice(0, TOP_STOCKS_EMPTY);
    } else {
      stockResults = all
        .filter(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            (s.name && s.name.toLowerCase().includes(q)),
        )
        .slice(0, MAX_STOCK_RESULTS);
    }

    const navResults = !q
      ? NAV_COMMANDS
      : NAV_COMMANDS.filter((n) => n.label.toLowerCase().includes(q));

    return { stockResults, navResults };
  }, [query, stocks]);

  // Flatten the groups into an ordered list of runnable items for keyboard nav.
  const flatItems = useMemo(() => {
    const items = [];
    for (const s of stockResults) {
      items.push({ kind: 'stock', key: `stock-${s.symbol}`, stock: s });
    }
    for (const n of navResults) {
      items.push({ kind: 'nav', key: `nav-${n.to}`, nav: n });
    }
    return items;
  }, [stockResults, navResults]);

  // Keep the highlight in range when the result list shrinks.
  useEffect(() => {
    setActive((a) => {
      if (flatItems.length === 0) return 0;
      return Math.min(a, flatItems.length - 1);
    });
  }, [flatItems.length]);

  /**
   * Execute a result item: open the stock drawer or navigate. Closes the palette.
   * @param {{kind:'stock'|'nav',stock?:object,nav?:object}} item
   */
  const runItem = (item) => {
    if (!item) return;
    if (item.kind === 'stock') {
      openStock(item.stock.symbol);
    } else {
      navigate(item.nav.to);
    }
    closePalette();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (flatItems.length ? (a + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) =>
        flatItems.length ? (a - 1 + flatItems.length) % flatItems.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(flatItems[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  };

  // Scroll the highlighted row into view as the user arrows through results.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-active="true"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [active]);

  if (!open) return null;

  const stockStart = 0;
  const navStart = stockResults.length;

  return (
    <div
      className="fixed inset-0 z-[58] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={closePalette}
      role="presentation"
    >
      <div
        className={cx(
          'relative flex w-full max-w-xl flex-col overflow-hidden animate-fade-in-up',
          GLASS_CARD,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search stocks or jump to a page…"
            aria-label="Search stocks or navigate"
            className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[52vh] overflow-y-auto px-2 py-2"
          role="listbox"
          aria-label="Results"
        >
          {flatItems.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted">
              No results for{' '}
              <span className="font-semibold text-text">“{query}”</span>
            </div>
          ) : (
            <>
              {stockResults.length > 0 && (
                <div className="mb-1">
                  <div className={cx(LABEL, 'px-3 py-1.5')}>Stocks</div>
                  {stockResults.map((s, i) => {
                    const idx = stockStart + i;
                    const isActive = idx === active;
                    const up = (s.change ?? 0) >= 0;
                    return (
                      <button
                        key={`stock-${s.symbol}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        onMouseMove={() => setActive(idx)}
                        onClick={() => runItem(flatItems[idx])}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none',
                          isActive
                            ? 'bg-accent/12 ring-1 ring-inset ring-accent/30'
                            : 'hover:bg-white/[0.04]',
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted">
                          <TrendingUp size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-text">
                            {s.symbol}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {s.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={cx(NUM, 'block text-sm font-bold text-text')}>
                            {formatINR(s.price)}
                          </span>
                          <span
                            className={cx(
                              NUM,
                              'block text-[11px] font-semibold',
                              pnlColorClass(s.change),
                            )}
                          >
                            {up ? '▲' : '▼'} {formatPercent(s.changePercent)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {navResults.length > 0 && (
                <div>
                  <div className={cx(LABEL, 'px-3 py-1.5')}>Navigation</div>
                  {navResults.map((n, i) => {
                    const idx = navStart + i;
                    const isActive = idx === active;
                    const Icon = n.icon;
                    return (
                      <button
                        key={`nav-${n.to}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        onMouseMove={() => setActive(idx)}
                        onClick={() => runItem(flatItems[idx])}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none',
                          isActive
                            ? 'bg-accent/12 ring-1 ring-inset ring-accent/30'
                            : 'hover:bg-white/[0.04]',
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted">
                          <Icon size={14} />
                        </span>
                        <span className="flex-1 text-sm font-medium text-text">
                          Go to {n.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">Page</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <ArrowUp size={12} />
            <ArrowDown size={12} />
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <CornerDownLeft size={12} />
            select
          </span>
          <span className="ml-auto">esc to close</span>
        </div>
      </div>
    </div>
  );
}

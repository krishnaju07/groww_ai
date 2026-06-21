import { useEffect } from 'react';
import { Activity, Menu, Search } from 'lucide-react';
import usePortfolioStore from '../../store/usePortfolioStore';
import useStocksStore from '../../store/useStocksStore';
import useTradingModeStore from '../../store/useTradingModeStore';
import useUiStore from '../../store/useUiStore';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { cx, GRADIENT_TEXT, GLOW_ACCENT, LABEL, NUM } from '../../lib/ui';
import AnimatedNumber from '../common/AnimatedNumber';
import TradingModeToggle from '../common/TradingModeToggle';
import NotificationsBell from './NotificationsBell';

/**
 * Top navigation bar.
 * Sticky frosted-glass bar with a glowing GrowwAI brand mark, a horizontally
 * scrolling live ticker of universe prices (from useStocksStore), the live
 * portfolio total value (from usePortfolioStore, via AnimatedNumber), the day
 * P&L, and a glow-pulse market-status dot.
 * @returns {JSX.Element}
 */
export default function Navbar() {
  const summary = usePortfolioStore((s) => s.summary);
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio);
  const stocks = useStocksStore((s) => s.stocks);
  const fetchStocks = useStocksStore((s) => s.fetchStocks);
  const tradingStatus = useTradingModeStore((s) => s.status);
  const mode = tradingStatus ? tradingStatus.mode : 'paper';
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);
  const openPalette = useUiStore((s) => s.openPalette);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const totalValue = summary ? summary.totalValue : 0;
  const dayPnl = summary ? summary.dayPnl : 0;
  const dayPnlPercent = summary ? summary.dayPnlPercent : 0;

  // Duplicate the list so the marquee (translateX -50%) loops seamlessly.
  const tickerStocks = stocks.length > 0 ? [...stocks, ...stocks] : [];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-6 border-b border-white/[0.06] bg-bg/70 px-6 backdrop-blur-xl">
      {/* Hamburger — opens the mobile nav drawer (md and below) */}
      <button
        type="button"
        onClick={toggleMobileNav}
        aria-label="Open navigation menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-muted transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 md:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Brand */}
      <div className="flex shrink-0 items-center gap-3">
        <div
          className={cx(
            'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853] to-[#00E676] text-[#04210F]',
            GLOW_ACCENT
          )}
        >
          <Activity size={20} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-lg font-bold tracking-tight">
            <span className={GRADIENT_TEXT}>Groww</span>
            <span className="text-text">AI</span>
          </span>
          <span
            className={cx(
              'text-[11px]',
              mode === 'live' ? 'font-semibold text-danger' : 'text-muted',
            )}
          >
            {mode === 'live' ? 'LIVE · Real Money' : 'AI Paper Trading'}
          </span>
        </div>
      </div>

      {/* Live ticker marquee */}
      <div className="no-scrollbar relative hidden min-w-0 flex-1 overflow-hidden lg:block">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-bg/80 to-transparent" />
        {tickerStocks.length > 0 && (
          <div className="flex w-max animate-marquee items-center gap-6 whitespace-nowrap">
            {tickerStocks.map((s, i) => {
              const up = (s.change ?? 0) >= 0;
              return (
                <div
                  key={`${s.symbol}-${i}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="font-semibold tracking-tight text-text">
                    {s.symbol}
                  </span>
                  <span className={cx(NUM, 'text-muted')}>
                    {formatINR(s.price)}
                  </span>
                  <span
                    className={cx(
                      NUM,
                      'font-medium',
                      pnlColorClass(s.change)
                    )}
                  >
                    {formatPercent(s.changePercent)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Portfolio + market status */}
      <div className="flex shrink-0 items-center gap-5">
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className={LABEL}>Portfolio</span>
          <AnimatedNumber
            value={totalValue}
            format={formatINR}
            className="text-base font-semibold text-text"
          />
        </div>
        <div className="hidden flex-col items-end leading-tight md:flex">
          <span className={LABEL}>Day P&amp;L</span>
          <span
            className={cx(NUM, 'text-base font-semibold', pnlColorClass(dayPnl))}
          >
            {formatINR(dayPnl)} ({formatPercent(dayPnlPercent)})
          </span>
        </div>

        {/* Compact command-palette search trigger (hidden on small screens) */}
        <button
          type="button"
          onClick={openPalette}
          aria-label="Open search (Command or Ctrl + K)"
          className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-muted transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:flex"
        >
          <Search size={15} />
          <span>Search…</span>
          <kbd className="ml-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            ⌘K
          </kbd>
        </button>

        <NotificationsBell />
        <TradingModeToggle />
      </div>
    </header>
  );
}

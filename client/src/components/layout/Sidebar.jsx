import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, Settings, FlaskConical, Activity, Search } from 'lucide-react';
import useUiStore from '../../store/useUiStore';
import { cx, GRADIENT_TEXT, GLOW_ACCENT } from '../../lib/ui';

/**
 * @typedef {Object} NavItem
 * @property {string} to
 * @property {string} label
 * @property {import('lucide-react').LucideIcon} icon
 */

/** @type {NavItem[]} */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/trade', label: 'Trade', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/backtest', label: 'Backtest', icon: FlaskConical },
];

/**
 * Left navigation rail with lucide-react icons.
 * Glass vertical rail: glowing brand at top, NavLinks with active
 * accent-gradient tint + left glow bar, and a paper-trading footer note.
 * @returns {JSX.Element}
 */
export default function Sidebar() {
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);
  const openPalette = useUiStore((s) => s.openPalette);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className={cx(
            'flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853] to-[#00E676] text-[#04210F]',
            GLOW_ACCENT
          )}
        >
          <Activity size={18} strokeWidth={2.5} />
        </div>
        <span className="font-display text-lg font-bold tracking-tight">
          <span className={GRADIENT_TEXT}>Groww</span>
          <span className="text-text">AI</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={closeMobileNav}
            className={({ isActive }) =>
              cx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-gradient-to-r from-accent/15 to-accent/[0.04] text-accent'
                  : 'text-muted hover:bg-white/5 hover:text-text'
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Left glow bar (active only) */}
                <span
                  className={cx(
                    'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#00C853] to-[#00E676] transition-opacity',
                    GLOW_ACCENT,
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Icon size={18} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-4">
        <button
          type="button"
          onClick={openPalette}
          aria-label="Open search (Command or Ctrl + K)"
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className="flex items-center gap-2">
            <Search size={14} />
            Search…
          </span>
          <kbd className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            ⌘K
          </kbd>
        </button>
        <p className="text-[11px] leading-relaxed text-muted">
          Paper trading only · No real money
        </p>
      </div>
    </aside>
  );
}

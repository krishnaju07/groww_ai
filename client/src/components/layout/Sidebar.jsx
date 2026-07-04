import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, Wallet, ListOrdered, Sparkles, ShieldAlert, Plug, Settings } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/trade', label: 'Trade', icon: LineChart },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/orders', label: 'Orders', icon: ListOrdered },
  { to: '/ai-decisions', label: 'AI Decisions', icon: Sparkles },
  { to: '/risk', label: 'Risk', icon: ShieldAlert },
  { to: '/brokers', label: 'Brokers', icon: Plug },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-surface/40 p-4 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-grad font-display text-sm font-extrabold text-bg">
          G
        </div>
        <span className="font-display text-lg font-bold gradient-text">GrowwAI</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface hover:text-text'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="rounded-xl border border-border/70 bg-bg/40 p-3 text-xs text-muted">
        Single-user paper trading account. Real-money mode is configured from Settings.
      </div>
    </aside>
  );
}

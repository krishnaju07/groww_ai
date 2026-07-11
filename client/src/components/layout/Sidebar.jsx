import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, Wallet, ListOrdered, Sparkles, Power, ShieldAlert, Plug, Settings, FlaskConical, BarChart3 } from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Trading',
    links: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/trade', label: 'Trade', icon: LineChart },
      { to: '/portfolio', label: 'Portfolio', icon: Wallet },
      { to: '/orders', label: 'Orders', icon: ListOrdered },
    ],
  },
  {
    label: 'Automation',
    links: [
      { to: '/ai-decisions', label: 'AI Decisions', icon: Sparkles },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/backtest', label: 'Backtest', icon: FlaskConical },
      { to: '/live-trading', label: 'Live Trading', icon: Power },
    ],
  },
  {
    label: 'Configuration',
    links: [
      { to: '/risk', label: 'Risk', icon: ShieldAlert },
      { to: '/brokers', label: 'Brokers', icon: Plug },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-accent-grad font-display text-base font-extrabold text-bg shadow-glow">
        G
      </div>
      <span className="font-display text-lg font-bold gradient-text">GrowwAI</span>
    </div>
  );
}

/** The nav link list itself — shared by the desktop Sidebar and the mobile MobileNav drawer. */
export function NavLinks({ onNavigate }) {
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted/50">{section.label}</div>
          <div className="flex flex-col gap-0.5">
            {section.links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:translate-x-0.5 hover:bg-surface hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-grad transition-all duration-200 ${
                        isActive ? 'opacity-100 shadow-glow' : 'opacity-0 group-hover:opacity-40'
                      }`}
                    />
                    <Icon size={18} className="shrink-0" />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-surface/40 p-4 md:flex">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        <NavLinks />
      </div>

      <div className="rounded-xl border border-border/70 bg-bg/40 p-3 text-xs leading-relaxed text-muted">
        Single-user paper trading account. Real-money mode is configured from Live Trading.
      </div>
    </aside>
  );
}

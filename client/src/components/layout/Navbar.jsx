import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { ModeSwitch } from '../common/ModeSwitch.jsx';
import { useSettingsStore } from '../../store/useSettingsStore.js';
import { healthService } from '../../services/health.service.js';

/** @param {{onMenuClick?:()=>void}} props */
export function Navbar({ onMenuClick }) {
  const fetch = useSettingsStore((s) => s.fetch);
  const [now, setNow] = useState(new Date());
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch();
    const clockId = setInterval(() => setNow(new Date()), 1000 * 30);

    const pollHealth = () => healthService.get().then(setHealth).catch(() => {});
    pollHealth();
    const healthId = setInterval(pollHealth, 20_000);

    return () => {
      clearInterval(clockId);
      clearInterval(healthId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sticky top-0 z-40 border-b border-border/70 bg-surface/50 backdrop-blur-xl">
      <header className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onMenuClick}
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-text md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/60 bg-bg/40 py-1 pl-1 pr-3">
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 animate-glow-pulse rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="truncate text-xs font-medium text-muted">
              <span className="hidden sm:inline">Market data live &middot; </span>
              {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ModeSwitch compact />
        </div>
      </header>

      {health?.marketDataDegraded && (
        <div className="flex items-center gap-2 border-t border-danger/40 bg-danger/10 px-4 py-2 text-xs font-medium text-danger sm:px-6">
          <span>⚠</span>
          <span>
            Market data degraded — {health.marketDataProvider} is failing and every price/indicator is currently FAKE
            (simulated) data{health.marketDataFallbackReason ? `: ${health.marketDataFallbackReason}` : ''}. Switch the
            provider on the Settings page.
          </span>
        </div>
      )}
    </div>
  );
}

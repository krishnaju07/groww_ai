import { useEffect, useState } from 'react';
import { ModeSwitch } from '../common/ModeSwitch.jsx';
import { useSettingsStore } from '../../store/useSettingsStore.js';
import { healthService } from '../../services/health.service.js';

export function Navbar() {
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
    <div className="border-b border-border/70 bg-surface/40 backdrop-blur-xl">
      <header className="flex items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-glow-pulse rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-xs font-medium text-muted">
            Market data live &middot; {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ModeSwitch compact />
        </div>
      </header>

      {health?.marketDataDegraded && (
        <div className="flex items-center gap-2 border-t border-danger/40 bg-danger/10 px-6 py-2 text-xs font-medium text-danger">
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

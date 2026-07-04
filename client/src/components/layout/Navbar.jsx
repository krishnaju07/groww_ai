import { useEffect, useState } from 'react';
import { Badge } from '../common/Badge.jsx';
import { useSettingsStore } from '../../store/useSettingsStore.js';

export function Navbar() {
  const { tradingMode, fetch } = useSettingsStore();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    fetch();
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLive = tradingMode?.mode === 'live' && tradingMode?.liveAvailable;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/70 bg-surface/40 px-6 py-3.5 backdrop-blur-xl">
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
        {isLive ? (
          <Badge tone="danger">LIVE — REAL MONEY</Badge>
        ) : (
          <Badge tone="accent">PAPER MODE</Badge>
        )}
      </div>
    </header>
  );
}

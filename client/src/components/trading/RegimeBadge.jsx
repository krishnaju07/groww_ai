import { useEffect, useState } from 'react';
import { aiService } from '../../services/ai.service.js';
import { usePolling } from '../../hooks/usePolling.js';

const TONE = {
  STRONG_BULLISH: 'border-accent/50 bg-accent/10 text-accent',
  MILD_BULLISH: 'border-accent/40 bg-accent/5 text-accent',
  STRONG_BEARISH: 'border-danger/50 bg-danger/10 text-danger',
  MILD_BEARISH: 'border-danger/40 bg-danger/5 text-danger',
  RANGE_BOUND: 'border-warn/40 bg-warn/10 text-warn',
  CHOPPY: 'border-warn/40 bg-warn/10 text-warn',
  HIGH_VOLATILITY: 'border-warn/50 bg-warn/10 text-warn',
  UNKNOWN: 'border-border/70 text-muted',
};

const LABEL = {
  STRONG_BULLISH: 'Strong Bullish',
  MILD_BULLISH: 'Mild Bullish',
  STRONG_BEARISH: 'Strong Bearish',
  MILD_BEARISH: 'Mild Bearish',
  RANGE_BOUND: 'Range-bound',
  CHOPPY: 'Choppy',
  HIGH_VOLATILITY: 'High Volatility',
  UNKNOWN: 'Unknown',
};

/** Compact NIFTY market-regime pill — the "classify before trading" state, shown so the user can see why the auto-trader may be sitting out. */
export function RegimeBadge() {
  const [regime, setRegime] = useState(null);
  usePolling(() => aiService.regime().then(setRegime).catch(() => {}), 30000);

  if (!regime) return null;
  return (
    <span
      title={regime.reason}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${TONE[regime.regime] ?? TONE.UNKNOWN}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${regime.tradeable ? 'bg-current' : 'bg-current opacity-40'}`} />
      Regime: {LABEL[regime.regime] ?? regime.regime}
      {!regime.tradeable && <span className="opacity-70">· stand aside</span>}
    </span>
  );
}

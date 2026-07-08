import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Switch } from './Switch.jsx';
import { useSettingsStore } from '../../store/useSettingsStore.js';
import { settingsService } from '../../services/settings.service.js';
import { toast } from '../../store/useToastStore.js';
import { BTN_DANGER, BTN_SECONDARY } from '../../lib/ui.js';

/**
 * The one Paper/Live toggle used everywhere (navbar + Live Trading page) so
 * mode-switching logic lives in a single place. Flipping to Live asks for a
 * lightweight confirm — the heavier per-order REAL MONEY confirm and the
 * live-money safety switches on the Live Trading page still gate actual orders.
 * @param {{compact?:boolean, className?:string}} props
 */
export function ModeSwitch({ compact = false, className = '' }) {
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const fetchSettings = useSettingsStore((s) => s.fetch);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!tradingMode) return null;
  const isLive = tradingMode.mode === 'live';
  // effectiveMode() on the server silently downgrades to paper when a gate isn't met,
  // so reflect that here too instead of showing a confident "LIVE" that isn't real.
  const blocked = isLive && !tradingMode.liveAvailable;

  async function apply(mode) {
    setBusy(true);
    try {
      await settingsService.updateTradingMode({ tradingMode: mode });
      await fetchSettings();
      toast[mode === 'live' ? 'error' : 'success'](`Switched to ${mode.toUpperCase()} mode`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  function handleToggle(nextChecked) {
    if (!nextChecked) {
      apply('paper');
      return;
    }
    if (!tradingMode.liveAvailable) {
      toast.error('Live trading isn’t available yet — check the safety switches and broker connection on the Live Trading page.');
      return;
    }
    setConfirming(true);
  }

  const trackTone = blocked ? 'bg-warn/70 border-warn/50' : 'bg-danger/80 border-danger/60';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {!compact && (
        <span className={`text-xs font-semibold transition-colors ${!isLive ? 'text-accent' : 'text-muted'}`}>Paper</span>
      )}
      <Switch
        checked={isLive}
        onChange={handleToggle}
        disabled={busy}
        size={compact ? 'sm' : 'md'}
        checkedClass={trackTone}
        uncheckedClass="bg-accent/70 border-accent/50"
        label="Trading mode: paper or live"
      />
      <span
        className={`text-xs font-semibold transition-colors ${
          blocked ? 'text-warn' : isLive ? 'text-danger' : compact ? 'text-accent' : 'text-muted'
        }`}
      >
        {compact
          ? blocked
            ? 'LIVE (blocked)'
            : isLive
              ? 'LIVE — REAL MONEY'
              : 'PAPER MODE'
          : 'Live'}
      </span>

      {confirming &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirming(false)}>
            <div
              className="glass-card w-full max-w-sm border-danger/40 p-6 shadow-[0_0_44px_rgba(255,82,82,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 font-display text-lg font-bold text-danger">⚠ Switch to LIVE mode?</div>
              <p className="mb-4 text-sm text-muted">
                Orders placed from here on will attempt to use your connected broker with real money, subject to the
                live-trading safety switches on the Live Trading page. You can switch back to Paper any time.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} className={`flex-1 ${BTN_SECONDARY}`}>
                  Cancel
                </button>
                <button onClick={() => apply('live')} disabled={busy} className={`flex-1 ${BTN_DANGER}`}>
                  Switch to Live
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

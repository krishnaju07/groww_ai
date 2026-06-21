import { useEffect, useState } from 'react';
import { ShieldCheck, Zap, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import useTradingModeStore from '../../store/useTradingModeStore';
import { toast } from '../../store/useToastStore';
import Modal from './Modal';
import Spinner from './Spinner';
import { cx, BTN_PRIMARY, BTN_GHOST } from '../../lib/ui';

/**
 * The single Paper ↔ Real Money switch (segmented control).
 *
 * Maximum-safety UX: switching to live opens a "REAL MONEY" confirmation. If the
 * server is not configured for live trading, an info modal explains exactly what
 * is required instead of switching. Paper is always one safe click away.
 * @returns {JSX.Element}
 */
export default function TradingModeToggle() {
  const status = useTradingModeStore((s) => s.status);
  const switching = useTradingModeStore((s) => s.switching);
  const fetchStatus = useTradingModeStore((s) => s.fetchStatus);
  const setMode = useTradingModeStore((s) => s.setMode);

  const [confirmLive, setConfirmLive] = useState(false);
  const [needSetup, setNeedSetup] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const mode = status ? status.mode : 'paper';
  const isLive = mode === 'live';
  const liveAvailable = Boolean(status && status.liveAvailable);

  const pickPaper = async () => {
    if (mode === 'paper') return;
    setError(null);
    try {
      await setMode('paper');
      toast.info('Switched to paper mode');
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to switch';
      setError(message);
      toast.error('Failed to switch', message);
    }
  };

  const pickLive = () => {
    if (mode === 'live') return;
    setError(null);
    if (!liveAvailable) {
      setNeedSetup(true);
      return;
    }
    setConfirmLive(true);
  };

  const confirmGoLive = async () => {
    setError(null);
    try {
      await setMode('live');
      setConfirmLive(false);
      toast.info('Switched to live mode');
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to switch to live';
      setError(message);
      toast.error('Failed to switch', message);
    }
  };

  const Req = ({ ok, children }) => (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 size={16} className="shrink-0 text-accent" />
      ) : (
        <XCircle size={16} className="shrink-0 text-danger" />
      )}
      <span className={ok ? 'text-text' : 'text-muted'}>{children}</span>
    </li>
  );

  return (
    <>
      <div
        className={cx(
          'inline-flex items-center rounded-xl border p-0.5 text-xs font-semibold transition-colors',
          isLive ? 'border-danger/40 bg-danger/10' : 'border-white/10 bg-white/[0.03]',
        )}
        role="group"
        aria-label="Trading mode"
      >
        <button
          type="button"
          onClick={pickPaper}
          disabled={switching}
          className={cx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all disabled:opacity-60',
            !isLive
              ? 'bg-gradient-to-r from-[#00C853] to-[#00E676] text-[#04210F] shadow-[0_2px_12px_-2px_rgba(0,200,83,0.6)]'
              : 'text-muted hover:text-text',
          )}
          title="Paper trading — simulated, no real money"
        >
          <ShieldCheck size={14} strokeWidth={2.5} />
          Paper
        </button>
        <button
          type="button"
          onClick={pickLive}
          disabled={switching}
          className={cx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all disabled:opacity-60',
            isLive
              ? 'animate-glow-pulse bg-gradient-to-r from-danger to-[#FF7A7A] text-white shadow-[0_2px_14px_-2px_rgba(255,82,82,0.75)]'
              : 'text-muted hover:text-text',
          )}
          title="Real-money trading via your Groww account"
        >
          <Zap size={14} strokeWidth={2.5} />
          Real Money
        </button>
      </div>

      {/* Confirm switch to REAL MONEY */}
      <Modal open={confirmLive} title="Switch to REAL MONEY trading?" onClose={() => setConfirmLive(false)}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              Orders will execute on your <b>real Groww account</b> with <b>real funds</b>. You
              will still confirm every individual order before it is placed, and AI
              auto-trading stays disabled in live mode.
            </p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => setConfirmLive(false)} disabled={switching}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmGoLive}
              disabled={switching}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-danger to-[#FF7A7A] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_-4px_rgba(255,82,82,0.6)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {switching ? <Spinner size="sm" /> : <Zap size={16} />}
              Enable Real Money
            </button>
          </div>
        </div>
      </Modal>

      {/* Live not configured — explain the requirements */}
      <Modal open={needSetup} title="Live trading isn't configured yet" onClose={() => setNeedSetup(false)}>
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-muted">
            Real-money trading via Groww needs all of the following on the server:
          </p>
          <ul className="flex flex-col gap-2.5">
            <Req ok={Boolean(status && status.liveEnabledEnv)}>
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">ENABLE_LIVE_TRADING=true</code> in{' '}
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">server/.env</code>
            </Req>
            <Req ok={Boolean(status && status.hasToken)}>
              a valid <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">GROWW_ACCESS_TOKEN</code>
            </Req>
            <Req ok={false}>an active Groww API subscription (₹499/mo)</Req>
          </ul>
          <p className="text-xs text-muted">Add these, restart the server, then switch again.</p>
          <div className="flex justify-end">
            <button type="button" className={BTN_PRIMARY} onClick={() => setNeedSetup(false)}>
              Got it
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

import { useState } from 'react';
import { ModalOverlay } from './ModalOverlay.jsx';
import { BTN_DANGER, BTN_SECONDARY, INPUT } from '../../lib/ui.js';

const PHRASE = 'ENABLE LIVE AUTO TRADING';

/**
 * @param {{onConfirm:(phrase:string)=>void, onCancel:()=>void}} props
 */
export function LiveAutoTradingConfirmModal({ onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim() === PHRASE;

  return (
    <ModalOverlay onDismiss={onCancel}>
      <div
        className="glass-card w-full max-w-md border-danger/40 p-6 shadow-[0_0_44px_rgba(255,82,82,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-display text-lg font-bold text-danger">⚠ UNATTENDED LIVE-MONEY TRADING</div>
        <p className="mb-4 text-sm text-muted">
          Turning this on lets the auto-trading engine place real, unattended orders on your connected live broker —
          no per-order confirmation, no human review before the money moves. It only fires when your other guardrails
          (confidence threshold, risk manager, daily profit lock, kill switch) allow it, but there is no click-to-confirm
          on each trade once this is on.
        </p>
        <label className="mb-1 block text-xs font-medium text-muted">
          Type <span className="font-mono text-text">{PHRASE}</span> exactly to confirm
        </label>
        <input
          autoFocus
          className={INPUT}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={PHRASE}
        />
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className={`flex-1 ${BTN_SECONDARY}`}>
            Cancel
          </button>
          <button onClick={() => onConfirm(typed)} disabled={!canConfirm} className={`flex-1 ${BTN_DANGER}`}>
            Enable Unattended Live Trading
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

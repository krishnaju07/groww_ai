import { useState } from 'react';
import { BTN_DANGER, BTN_SECONDARY, INPUT } from '../../lib/ui.js';

/**
 * @param {{action:string, symbol:string, quantity:number, estimatedValue:number, onConfirm:()=>void, onCancel:()=>void}} props
 */
export function RealMoneyConfirmModal({ action, symbol, quantity, estimatedValue, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim().toUpperCase() === 'CONFIRM';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="glass-card w-full max-w-md border-danger/40 p-6 shadow-[0_0_44px_rgba(255,82,82,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-display text-lg font-bold text-danger">⚠ REAL MONEY ORDER</div>
        <p className="mb-4 text-sm text-muted">
          You are about to <span className="font-semibold text-text">{action}</span>{' '}
          <span className="font-semibold text-text">{quantity}</span> shares of{' '}
          <span className="font-semibold text-text">{symbol}</span> for an estimated{' '}
          <span className="font-semibold text-text">₹{estimatedValue.toFixed(2)}</span> using a live broker connection.
          This will place a real order with real money.
        </p>
        <label className="mb-1 block text-xs font-medium text-muted">Type CONFIRM to proceed</label>
        <input
          autoFocus
          className={INPUT}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="CONFIRM"
        />
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className={`flex-1 ${BTN_SECONDARY}`}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={!canConfirm} className={`flex-1 ${BTN_DANGER}`}>
            Place Real Order
          </button>
        </div>
      </div>
    </div>
  );
}

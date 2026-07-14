import { useState } from 'react';
import { ModalOverlay } from './ModalOverlay.jsx';
import { BTN_DANGER, BTN_SECONDARY, INPUT } from '../../lib/ui.js';
import { formatINR } from '../../lib/format.js';

/**
 * "How many of this position to close" — asked every time, even when there's only one
 * way to answer it (all of it), so a click on Exit is never a silent full-quantity fire.
 * @param {{position:object, onConfirm:(quantity:number)=>void, onCancel:()=>void}} props
 */
export function ExitPositionModal({ position: p, onConfirm, onCancel }) {
  const [quantity, setQuantity] = useState(p.quantity);
  const valid = quantity >= 1 && quantity <= p.quantity;

  return (
    <ModalOverlay onDismiss={onCancel}>
      <div className="glass-card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 font-display text-lg font-bold">Exit {p.symbol}</div>
        <p className="mb-4 text-sm text-muted">
          You're holding <span className="font-semibold text-text">{p.quantity}</span>. Choose how many to sell now —
          the rest stays open.
        </p>

        <label className="mb-1 block text-xs font-medium text-muted">Quantity to sell</label>
        <input
          autoFocus
          type="number"
          min={1}
          max={p.quantity}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(p.quantity, parseInt(e.target.value, 10) || 1)))}
          className={INPUT}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.quantity > 1 && (
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, Math.floor(p.quantity / 2)))}
              className="rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-border"
            >
              Half
            </button>
          )}
          <button
            type="button"
            onClick={() => setQuantity(p.quantity)}
            className="rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-border"
          >
            All ({p.quantity})
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-bg/30 p-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>LTP</span>
            <span>{formatINR(p.ltp)}</span>
          </div>
          <div className="mt-1 flex justify-between font-medium">
            <span>Est. value</span>
            <span>{formatINR((p.ltp || 0) * quantity)}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className={`flex-1 ${BTN_SECONDARY}`}>
            Cancel
          </button>
          <button onClick={() => onConfirm(quantity)} disabled={!valid} className={`flex-1 ${BTN_DANGER}`}>
            Sell {quantity}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

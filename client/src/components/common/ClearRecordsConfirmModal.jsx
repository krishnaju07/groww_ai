import { useState } from 'react';
import { ModalOverlay } from './ModalOverlay.jsx';
import { BTN_DANGER, BTN_SECONDARY, INPUT } from '../../lib/ui.js';

/**
 * @param {{title:string, description:React.ReactNode, confirmLabel:string,
 *   requirePhrase?:string|null, onConfirm:(typedPhrase:string)=>void, onCancel:()=>void}} props
 */
export function ClearRecordsConfirmModal({ title, description, confirmLabel, requirePhrase, onConfirm, onCancel }) {
  const needsPhrase = !!requirePhrase;
  const [typed, setTyped] = useState('');
  const canConfirm = !needsPhrase || typed.trim() === requirePhrase;

  return (
    <ModalOverlay onDismiss={onCancel}>
      <div
        className={`glass-card w-full max-w-md p-6 ${needsPhrase ? 'border-danger/40 shadow-[0_0_44px_rgba(255,82,82,0.25)]' : 'border-border'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-2 font-display text-lg font-bold ${needsPhrase ? 'text-danger' : 'text-text'}`}>{title}</div>
        <p className="mb-4 text-sm text-muted">{description}</p>
        {needsPhrase && (
          <>
            <label className="mb-1 block text-xs font-medium text-muted">
              Type <span className="font-mono text-text">{requirePhrase}</span> exactly to confirm
            </label>
            <input autoFocus className={INPUT} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requirePhrase} />
          </>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className={`flex-1 ${BTN_SECONDARY}`}>
            Cancel
          </button>
          <button onClick={() => onConfirm(typed)} disabled={!canConfirm} className={`flex-1 ${BTN_DANGER}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

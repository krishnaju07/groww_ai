import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cx, GLASS_CARD } from '../../lib/ui';

/**
 * Modal — centered glass dialog with a blurred backdrop. Renders nothing when
 * closed. Closes on backdrop click and Escape key.
 *
 * @param {Object} props
 * @param {boolean} props.open               Whether the modal is visible.
 * @param {string} [props.title]             Header title.
 * @param {()=>void} props.onClose           Called to request close.
 * @param {React.ReactNode} props.children   Modal body.
 * @returns {JSX.Element|null}
 */
export default function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cx('relative w-full max-w-lg overflow-hidden p-5 animate-fade-in-up', GLASS_CARD)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-text">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <X size={18} />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

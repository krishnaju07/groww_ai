import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Logo, NavLinks } from './Sidebar.jsx';

/**
 * Slide-out nav drawer for < md viewports, where the desktop Sidebar is hidden
 * entirely — without this there was no way to navigate the app at all on a
 * phone/small tablet past whatever route you landed on.
 * @param {{open:boolean, onClose:()=>void}} props
 */
export function MobileNav({ open, onClose }) {
  // Lock body scroll while the drawer is open so the page behind it doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border/70 bg-surface/95 p-4 shadow-card backdrop-blur-xl transition-transform duration-300 ease-out md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-text"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto">
          <NavLinks onNavigate={onClose} />
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-bg/40 p-3 text-xs leading-relaxed text-muted">
          Single-user paper trading account. Real-money mode is configured from Live Trading.
        </div>
      </aside>
    </>
  );
}

import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ToastContainer from '../common/ToastContainer';
import CommandPalette from '../common/CommandPalette';
import StockDrawer from '../common/StockDrawer';
import WelcomeModal from '../common/WelcomeModal';
import useUiStore from '../../store/useUiStore';
import { useAutoTradeToasts } from '../../hooks/useAutoTradeToasts';
import { cx } from '../../lib/ui';

/**
 * True when the keyboard event originates from a text-entry context, so we don't
 * hijack typing (e.g. the "/" shortcut) while the user is in a field.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const el = /** @type {HTMLElement} */ (target);
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

/**
 * App shell: fixed-width Sidebar + a right column with a sticky Navbar and a
 * scrollable centered <main> wrapping react-router's <Outlet/> in a fade-in.
 *
 * Also mounts the global UX overlays (toasts, ⌘K command palette, stock drawer,
 * first-visit welcome modal), drives the auto-trade toast poller, wires the
 * ⌘K / Ctrl+K (and "/") keyboard shortcut to the command palette, and renders
 * the Sidebar as a slide-in drawer on mobile (static on md+).
 *
 * @returns {JSX.Element}
 */
export default function Layout() {
  const togglePalette = useUiStore((s) => s.togglePalette);
  const openPalette = useUiStore((s) => s.openPalette);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);

  // Surface newly executed automatic trades as toasts.
  useAutoTradeToasts();

  // Global keyboard shortcuts: ⌘K / Ctrl+K toggles the palette; "/" opens it
  // (only when the user isn't typing in a field).
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key ? e.key.toLowerCase() : '';
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePalette, openPalette]);

  // Close the mobile nav drawer on Escape while it's open.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMobileNav();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen, closeMobileNav]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      {/* Static sidebar (md and up) */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile slide-in sidebar drawer */}
      <div className="md:hidden">
        {/* Backdrop */}
        <div
          className={cx(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
            mobileNavOpen
              ? 'opacity-100 animate-fade-in'
              : 'pointer-events-none opacity-0',
          )}
          onClick={closeMobileNav}
          role="presentation"
          aria-hidden={!mobileNavOpen}
        />
        {/* Drawer */}
        <div
          className={cx(
            'fixed inset-y-0 left-0 z-50 flex transition-transform duration-300',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          aria-hidden={!mobileNavOpen}
          inert={!mobileNavOpen ? '' : undefined}
        >
          <Sidebar />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] animate-fade-in-up p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global UX overlays — mounted once */}
      <ToastContainer />
      <CommandPalette />
      <StockDrawer />
      <WelcomeModal />
    </div>
  );
}

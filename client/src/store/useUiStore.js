import { create } from 'zustand';

/**
 * UI store: coordinates global overlays (command palette, stock drawer) and the
 * mobile navigation drawer. Holds no business data — purely presentational
 * coordination shared across the layout, navbar, sidebar, and overlay
 * components.
 *
 * @typedef {Object} UiState
 * @property {boolean} paletteOpen                 Command palette visibility.
 * @property {() => void} openPalette
 * @property {() => void} closePalette
 * @property {() => void} togglePalette
 * @property {string|null} drawerSymbol            null = closed; else canonical symbol shown in StockDrawer.
 * @property {(symbol: string) => void} openStock
 * @property {() => void} closeStock
 * @property {boolean} mobileNavOpen               Mobile sidebar drawer visibility.
 * @property {() => void} openMobileNav
 * @property {() => void} closeMobileNav
 * @property {() => void} toggleMobileNav
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<UiState>>} */
const useUiStore = create((set) => ({
  // --- Command palette (⌘K) ---
  paletteOpen: false,
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

  // --- Stock detail drawer ---
  drawerSymbol: null,
  openStock: (symbol) => set({ drawerSymbol: symbol }),
  closeStock: () => set({ drawerSymbol: null }),

  // --- Mobile navigation drawer ---
  mobileNavOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
}));

export default useUiStore;

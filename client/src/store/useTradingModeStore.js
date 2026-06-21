import { create } from 'zustand';
import { getTradingMode, setTradingMode } from '../services/tradingMode.service';

/**
 * Trading-mode store: current mode (paper/live) + live-availability gating flags,
 * shared across the navbar toggle and the trade panel's REAL MONEY confirmation.
 */
const useTradingModeStore = create((set) => ({
  /** @type {import('../types').TradingModeStatus | null} */
  status: null,
  loading: false,
  switching: false,
  error: null,

  /** Load the current trading-mode status. */
  async fetchStatus() {
    set({ loading: true, error: null });
    try {
      const status = await getTradingMode();
      set({ status, loading: false });
    } catch (err) {
      set({ error: err && err.message ? err.message : 'Failed to load trading mode', loading: false });
    }
  },

  /**
   * Switch mode. Rejects (and surfaces the server message) when live is blocked.
   * @param {'paper'|'live'} mode
   * @returns {Promise<import('../types').TradingModeStatus>}
   */
  async setMode(mode) {
    set({ switching: true, error: null });
    try {
      const status = await setTradingMode(mode);
      set({ status, switching: false });
      return status;
    } catch (err) {
      set({ switching: false, error: err && err.message ? err.message : 'Failed to switch mode' });
      throw err;
    }
  },
}));

export default useTradingModeStore;

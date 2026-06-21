import { create } from 'zustand';
import { getTradingMode, setTradingMode } from '../services/tradingMode.service';

/**
 * Trading-mode store: current mode (paper/live) + live-availability gating flags,
 * shared across the navbar toggle and the trade panel's REAL MONEY confirmation.
 */
// De-dup concurrent fetchStatus() (the navbar toggle + trade panel both load it)
// plus a short TTL. setMode updates `status` directly, so no refetch is needed.
let modeInflight = null;
let modeFetchedAt = 0;
const MODE_TTL_MS = 5000;

const useTradingModeStore = create((set, get) => ({
  /** @type {import('../types').TradingModeStatus | null} */
  status: null,
  loading: false,
  switching: false,
  error: null,

  /** Load the current trading-mode status (de-duped + short TTL). */
  fetchStatus() {
    if (modeInflight) return modeInflight;
    if (get().status && Date.now() - modeFetchedAt < MODE_TTL_MS) {
      return Promise.resolve();
    }
    set({ loading: true, error: null });
    modeInflight = (async () => {
      try {
        const status = await getTradingMode();
        modeFetchedAt = Date.now();
        set({ status, loading: false });
      } catch (err) {
        set({ error: err && err.message ? err.message : 'Failed to load trading mode', loading: false });
      } finally {
        modeInflight = null;
      }
    })();
    return modeInflight;
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

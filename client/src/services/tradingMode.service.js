import { apiGet, apiPut } from '../lib/api';

/**
 * Fetch the current trading mode + live-availability gating flags.
 * @returns {Promise<import('../types').TradingModeStatus>}
 */
export function getTradingMode() {
  return apiGet('/trading-mode');
}

/**
 * Switch the trading mode. Switching to 'live' is refused by the server unless
 * it is fully configured (ENABLE_LIVE_TRADING=true + a valid GROWW_ACCESS_TOKEN).
 * @param {'paper'|'live'} mode
 * @returns {Promise<import('../types').TradingModeStatus>}
 */
export function setTradingMode(mode) {
  return apiPut('/trading-mode', { mode });
}

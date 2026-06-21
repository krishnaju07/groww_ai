/**
 * Broker selection + live-trading safety gates.
 *
 * MAXIMUM-SAFETY model — a real order can only ever fire when ALL hold:
 *   1. env.ENABLE_LIVE_TRADING === true   (server flag, default false)
 *   2. a non-empty GROWW_ACCESS_TOKEN     (real Groww credential)
 *   3. the user explicitly selected live mode (settings.tradingMode === 'live')
 *   + the client requires a "REAL MONEY" confirmation before sending the order.
 * Auto/AI trading additionally requires env.ENABLE_LIVE_AUTO_TRADING === true.
 */

import { env } from '../../config/env.js';
import { growwBroker } from './GrowwBroker.js';

export { growwBroker };

/** @returns {boolean} server is fully configured + enabled for live trading. */
export function isLiveConfigured() {
  return env.ENABLE_LIVE_TRADING === true && Boolean(env.GROWW_ACCESS_TOKEN);
}

/**
 * Throw a coded 403 unless live trading is fully configured + enabled.
 * @returns {void}
 */
export function assertLiveAllowed() {
  if (!env.ENABLE_LIVE_TRADING) {
    const e = new Error('Live trading is disabled on the server (set ENABLE_LIVE_TRADING=true).');
    e.code = 'LIVE_TRADING_DISABLED';
    e.status = 403;
    throw e;
  }
  if (!env.GROWW_ACCESS_TOKEN) {
    const e = new Error('GROWW_ACCESS_TOKEN is not configured on the server.');
    e.code = 'LIVE_TRADING_DISABLED';
    e.status = 403;
    throw e;
  }
}

/**
 * The EFFECTIVE mode for a settings doc: 'live' only when the user selected live
 * AND the server is fully configured for it; otherwise 'paper'. This guarantees
 * orders never route to the real broker unless everything is in place.
 * @param {*} settings
 * @returns {'paper'|'live'}
 */
export function effectiveMode(settings) {
  return settings?.tradingMode === 'live' && isLiveConfigured() ? 'live' : 'paper';
}

/**
 * Trading-mode status DTO surfaced to the client (drives the toggle + banners).
 * @param {*} settings
 * @returns {import('../../types.js').TradingModeStatus}
 */
export function getTradingModeStatus(settings) {
  const hasToken = Boolean(env.GROWW_ACCESS_TOKEN);
  const liveEnabledEnv = env.ENABLE_LIVE_TRADING === true;
  return {
    mode: settings?.tradingMode === 'live' ? 'live' : 'paper',
    liveAvailable: liveEnabledEnv && hasToken,
    liveEnabledEnv,
    hasToken,
    autoTradingInLive: env.ENABLE_LIVE_AUTO_TRADING === true,
  };
}

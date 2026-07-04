/**
 * The generalized 5-layer safety gate (extends the old single-broker Groww-only
 * gate to every broker):
 *   1. env.ENABLE_LIVE_TRADING === true        (server master switch, default false)
 *   2. a valid credential for the SPECIFIC active broker (credentialStore)
 *   3. the user explicitly selected live mode + a non-paper active broker
 *   4. the kill switch is not tripped (checked first — nothing else matters if it is)
 *   5. a per-order "REAL MONEY" confirmation from the client (enforced in orderService)
 * Unattended (cron) live orders additionally require env.ENABLE_LIVE_AUTO_TRADING.
 */
import { env } from '../../config/env.js';
import { hasValidCredential } from './credentialStore.js';
import { isTripped } from '../risk/killSwitch.js';

/** @param {string} userId @param {string} brokerName @returns {Promise<boolean>} */
export async function isLiveConfigured(userId, brokerName) {
  if (brokerName === 'paper') return false;
  if (!env.ENABLE_LIVE_TRADING) return false;
  if (await isTripped(userId)) return false;
  return hasValidCredential(userId, brokerName);
}

/** @param {string} userId @param {string} brokerName @throws {Error & {code:string, status:number}} */
export async function assertLiveAllowed(userId, brokerName) {
  if (await isTripped(userId)) {
    const e = new Error('Kill switch is engaged — live trading is blocked until reset.');
    e.code = 'KILL_SWITCH_TRIPPED';
    e.status = 403;
    throw e;
  }
  if (!env.ENABLE_LIVE_TRADING) {
    const e = new Error('Live trading is disabled on the server (set ENABLE_LIVE_TRADING=true).');
    e.code = 'LIVE_TRADING_DISABLED';
    e.status = 403;
    throw e;
  }
  if (brokerName === 'paper') {
    const e = new Error('Paper is not a live broker.');
    e.code = 'PAPER_ONLY';
    e.status = 400;
    throw e;
  }
  if (!(await hasValidCredential(userId, brokerName))) {
    const e = new Error(`No valid ${brokerName} credentials configured.`);
    e.code = 'NO_BROKER_CREDENTIALS';
    e.status = 403;
    throw e;
  }
}

/**
 * @param {string} userId
 * @param {{tradingMode:string, activeBroker:string}} settings
 * @returns {Promise<'paper'|'live'>} the EFFECTIVE mode — silently downgrades to paper
 *   unless every gate is satisfied, so an order never reaches a real broker by accident.
 */
export async function effectiveMode(userId, settings) {
  if (settings?.tradingMode !== 'live') return 'paper';
  return (await isLiveConfigured(userId, settings.activeBroker)) ? 'live' : 'paper';
}

/**
 * @param {string} userId
 * @param {{tradingMode:string, activeBroker:string}} settings
 * @returns {Promise<import('../../types.js').TradingModeStatus>}
 */
export async function getTradingModeStatus(userId, settings) {
  const hasCredential = settings.activeBroker !== 'paper' && (await hasValidCredential(userId, settings.activeBroker));
  const liveEnabledEnv = env.ENABLE_LIVE_TRADING === true;
  const killSwitchEngaged = await isTripped(userId);
  return {
    mode: settings?.tradingMode === 'live' ? 'live' : 'paper',
    activeBroker: settings?.activeBroker ?? 'paper',
    liveAvailable: liveEnabledEnv && hasCredential && !killSwitchEngaged,
    liveEnabledEnv,
    hasCredential,
    killSwitchEngaged,
    autoTradingInLive: env.ENABLE_LIVE_AUTO_TRADING === true,
  };
}

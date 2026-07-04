/**
 * The generalized 5-layer safety gate (extends the old single-broker Groww-only
 * gate to every broker):
 *   1. systemConfig.enableLiveTrading === true (master switch, UI-editable, default from .env)
 *   2. a valid credential for the SPECIFIC active broker (credentialStore)
 *   3. the user explicitly selected live mode + a non-paper active broker
 *   4. the kill switch is not tripped (checked first — nothing else matters if it is)
 *   5. a per-order "REAL MONEY" confirmation from the client (enforced in orderService)
 * Unattended (cron) live orders additionally require systemConfig.enableLiveAutoTrading.
 */
import { hasValidCredential } from './credentialStore.js';
import { hasGrowwCredentials } from './growwAuth.js';
import { isTripped } from '../risk/killSwitch.js';
import { getSystemConfig } from '../config/systemConfig.js';

/**
 * Groww's credential lives in server .env (GROWW_API_KEY/SECRET), checked via
 * hasGrowwCredentials() — NOT the BrokerCredential DB collection that Angel One
 * and Zerodha use. This is the single place that dispatches correctly per broker.
 * @param {string} userId @param {string} brokerName @returns {Promise<boolean>}
 */
async function hasBrokerCredential(userId, brokerName) {
  if (brokerName === 'groww') return hasGrowwCredentials();
  return hasValidCredential(userId, brokerName);
}

/** @param {string} userId @param {string} brokerName @returns {Promise<boolean>} */
export async function isLiveConfigured(userId, brokerName) {
  if (brokerName === 'paper') return false;
  const cfg = await getSystemConfig(userId);
  if (!cfg.enableLiveTrading) return false;
  if (await isTripped(userId)) return false;
  return hasBrokerCredential(userId, brokerName);
}

/** @param {string} userId @param {string} brokerName @throws {Error & {code:string, status:number}} */
export async function assertLiveAllowed(userId, brokerName) {
  if (await isTripped(userId)) {
    const e = new Error('Kill switch is engaged — live trading is blocked until reset.');
    e.code = 'KILL_SWITCH_TRIPPED';
    e.status = 403;
    throw e;
  }
  const cfg = await getSystemConfig(userId);
  if (!cfg.enableLiveTrading) {
    const e = new Error('Live trading is disabled (turn it on from Settings).');
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
  if (!(await hasBrokerCredential(userId, brokerName))) {
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
  const hasCredential = settings.activeBroker !== 'paper' && (await hasBrokerCredential(userId, settings.activeBroker));
  const cfg = await getSystemConfig(userId);
  const liveEnabledEnv = cfg.enableLiveTrading === true;
  const killSwitchEngaged = await isTripped(userId);
  return {
    mode: settings?.tradingMode === 'live' ? 'live' : 'paper',
    activeBroker: settings?.activeBroker ?? 'paper',
    liveAvailable: liveEnabledEnv && hasCredential && !killSwitchEngaged,
    liveEnabledEnv,
    hasCredential,
    killSwitchEngaged,
    autoTradingInLive: cfg.enableLiveAutoTrading === true,
  };
}

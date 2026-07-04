/**
 * The emergency stop. `trip()` cancels every order and closes every open
 * position across ALL connected brokers (paper AND live) in one call, then
 * blocks all further trading until `reset()` — a deliberate, non-one-click
 * action the user takes from the Risk page — is called.
 */
import { RiskConfig } from '../../models/RiskConfig.js';
import { RiskEvent } from '../../models/RiskEvent.js';
import { BrokerCredential } from '../../models/BrokerCredential.js';
import { brokerFor, availableBrokers } from '../brokers/registry.js';
import { getRiskConfig } from './riskConfig.js';

let cachedTripped = null; // {value, at} — short TTL cache, avoids a DB hit on every canTrade() call
const TRIPPED_CACHE_TTL_MS = 3000;

/** @param {string} userId @returns {Promise<string[]>} broker names currently usable for this user (paper + any with a stored credential) */
async function connectedBrokers(userId) {
  const brokers = ['paper'];
  const creds = await BrokerCredential.find({ userId }).lean();
  for (const c of creds) {
    if (availableBrokers().includes(c.broker) && !brokers.includes(c.broker)) brokers.push(c.broker);
  }
  return brokers;
}

/** @param {string} userId @returns {Promise<boolean>} */
export async function isTripped(userId) {
  if (cachedTripped && cachedTripped.userId === userId && Date.now() - cachedTripped.at < TRIPPED_CACHE_TTL_MS) {
    return cachedTripped.value;
  }
  const cfg = await getRiskConfig(userId);
  cachedTripped = { userId, value: cfg.killSwitchEngaged, at: Date.now() };
  return cfg.killSwitchEngaged;
}

/** @param {string} userId @param {string} [reason] */
export async function trip(userId, reason = 'manual') {
  await RiskConfig.updateOne(
    { userId },
    { killSwitchEngaged: true, killSwitchReason: reason, killSwitchAt: new Date() },
  );
  cachedTripped = { userId, value: true, at: Date.now() };

  const brokers = await connectedBrokers(userId);
  const errors = [];
  for (const brokerName of brokers) {
    try {
      const broker = brokerFor(brokerName, userId);
      await broker.cancelAllOrders();
      await broker.closeAllPositions();
    } catch (err) {
      errors.push(`${brokerName}: ${err.message}`);
      console.error(`[killSwitch] trip() failed for broker ${brokerName}:`, err);
    }
  }

  await RiskEvent.create({
    userId,
    type: 'KILL_SWITCH_TRIP',
    reason,
    context: { brokers, errors },
  });

  return { brokers, errors };
}

/** @param {string} userId */
export async function reset(userId) {
  await RiskConfig.updateOne({ userId }, { killSwitchEngaged: false, killSwitchReason: '', killSwitchAt: null });
  cachedTripped = { userId, value: false, at: Date.now() };
  await RiskEvent.create({ userId, type: 'KILL_SWITCH_RESET', reason: 'manual reset' });
}

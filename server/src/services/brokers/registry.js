/**
 * Resolves a broker name to a live adapter instance, one per (broker, userId),
 * cached for the process lifetime. Real broker adapters (Groww/Zerodha/AngelOne)
 * are added here as they're built; PaperBroker needs no credentials so it's
 * always available.
 */
import { createPaperBroker } from './PaperBroker.js';
import { createGrowwBroker } from './GrowwBroker.js';
import { createAngelOneBroker } from './AngelOneBroker.js';
import { createZerodhaBroker } from './ZerodhaBroker.js';

const FACTORIES = {
  paper: createPaperBroker,
  groww: createGrowwBroker,
  angelone: createAngelOneBroker,
  zerodha: createZerodhaBroker,
};

const instances = new Map(); // `${broker}:${userId}` -> adapter

/** @param {string} brokerName @param {string} userId @returns {import('../../types.js').BrokerAdapter} */
export function brokerFor(brokerName, userId) {
  const factory = FACTORIES[brokerName];
  if (!factory) {
    const e = new Error(`Unknown or not-yet-configured broker: ${brokerName}`);
    e.code = 'UNKNOWN_BROKER';
    e.status = 400;
    throw e;
  }
  const key = `${brokerName}:${userId}`;
  if (!instances.has(key)) instances.set(key, factory(userId));
  return instances.get(key);
}

/** @param {string} brokerName @param {(userId: string) => import('../../types.js').BrokerAdapter} factory */
export function registerBroker(brokerName, factory) {
  FACTORIES[brokerName] = factory;
}

/** @returns {string[]} broker names with a registered adapter factory */
export function availableBrokers() {
  return Object.keys(FACTORIES);
}

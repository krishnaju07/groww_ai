#!/usr/bin/env node
/**
 * Smoke-tests a broker's read-only calls (isConnected, getLTP) without placing
 * any order. Usage: node scripts/verify-broker.js --broker=groww|zerodha|angelone
 */
import { connectDb } from '../src/config/db.js';
import { DEFAULT_USER_ID } from '../src/config/constants.js';
import { brokerFor } from '../src/services/brokers/registry.js';

const brokerArg = process.argv.find((a) => a.startsWith('--broker='));
const brokerName = brokerArg ? brokerArg.split('=')[1] : 'paper';

async function main() {
  await connectDb();
  const broker = brokerFor(brokerName, DEFAULT_USER_ID);

  console.log(`[verify-broker] checking ${brokerName}...`);
  const connected = await broker.isConnected();
  console.log(`[verify-broker] isConnected: ${connected}`);
  if (!connected) {
    console.log('[verify-broker] not connected — check credentials on the Brokers page or .env.');
    process.exit(1);
  }

  const ltp = await broker.getLTP('RELIANCE');
  console.log(`[verify-broker] RELIANCE LTP: ${ltp}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[verify-broker] failed:', err.message);
  process.exit(1);
});

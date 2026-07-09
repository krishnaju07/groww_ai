import cron from 'node-cron';
import { brokerFor } from '../services/brokers/registry.js';
import { hasGrowwCredentials } from '../services/brokers/growwAuth.js';
import { trip } from '../services/risk/killSwitch.js';
import { getSelectedTradingMode } from '../services/brokers/tradingModeService.js';
import { DEFAULT_USER_ID } from '../config/constants.js';

const FAILURE_THRESHOLD = 3;
let failureCount = 0;

/**
 * Periodic Groww connectivity check — uses GrowwBroker.isConnected() (a real /user/detail
 * capability check, not just "can a token be minted") and trips the kill switch after
 * repeated failures while the user is actually in Live mode. A paper-mode failure is
 * logged but doesn't trip anything — there's no real exposure to protect yet.
 */
export function startBrokerHealthJob() {
  cron.schedule('0 */5 * * * *', async () => {
    if (!hasGrowwCredentials()) return; // nothing configured to check yet
    try {
      const ok = await brokerFor('groww', DEFAULT_USER_ID).isConnected();
      if (ok) {
        failureCount = 0;
        return;
      }
      failureCount += 1;
      console.warn(`[brokerHealthJob] Groww not connected (failure ${failureCount}/${FAILURE_THRESHOLD})`);
      if (failureCount >= FAILURE_THRESHOLD) {
        failureCount = 0;
        if ((await getSelectedTradingMode()) !== 'live') return;
        await trip(DEFAULT_USER_ID, `Groww connectivity check failed ${FAILURE_THRESHOLD}x in a row — auto-stopped for safety`);
      }
    } catch (err) {
      console.error('[brokerHealthJob] Groww connectivity check errored:', err.message);
    }
  });
  console.log('[brokerHealthJob] scheduled (every 5m) — Groww connectivity');
}

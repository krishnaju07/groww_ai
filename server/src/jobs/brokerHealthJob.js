import cron from 'node-cron';
import { BrokerCredential } from '../models/BrokerCredential.js';
import { trip } from '../services/risk/killSwitch.js';
import { DEFAULT_USER_ID } from '../config/constants.js';

const FAILURE_THRESHOLD = 3;
const failureCounts = new Map(); // broker -> consecutive failure count

/** Periodic broker connectivity/token-expiry check. Trips the kill switch after repeated failures on a live broker. */
export function startBrokerHealthJob() {
  cron.schedule('0 */5 * * * *', async () => {
    const creds = await BrokerCredential.find({ userId: DEFAULT_USER_ID }).lean();
    for (const cred of creds) {
      const expired = cred.expiresAt && new Date(cred.expiresAt).getTime() < Date.now();
      if (expired) {
        const count = (failureCounts.get(cred.broker) ?? 0) + 1;
        failureCounts.set(cred.broker, count);
        console.warn(`[brokerHealthJob] ${cred.broker} credential expired (failure ${count}/${FAILURE_THRESHOLD})`);
        if (count >= FAILURE_THRESHOLD) {
          await trip(DEFAULT_USER_ID, `${cred.broker} credential expired ${count}x — auto-stopped for safety`);
          failureCounts.set(cred.broker, 0);
        }
      } else {
        failureCounts.set(cred.broker, 0);
      }
    }
  });
  console.log('[brokerHealthJob] scheduled (every 5m)');
}

import cron from 'node-cron';
import { syncInstruments } from '../services/instruments/instrumentSync.js';

/** Refreshes the option instrument master once a day — strikes/expiries/lot sizes change over time (weekly expiries roll, NSE revises lot sizes periodically). 07:00 IST, well before market open, so the day's option chain is ready before anyone trades. */
export function startInstrumentSyncJob() {
  cron.schedule(
    '0 7 * * *',
    async () => {
      try {
        await syncInstruments();
      } catch (err) {
        console.error('[instrumentSyncJob] daily sync failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
  console.log('[instrumentSyncJob] scheduled (daily, 07:00 IST)');
}

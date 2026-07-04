import cron from 'node-cron';
import { runAutoTradingTick } from '../services/ai/autoTradingService.js';

let running = false;

/** Registers the 30s auto-trading tick. Skips overlapping runs. */
export function startAutoTradingJob() {
  cron.schedule('*/30 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const result = await runAutoTradingTick();
      if (result.ran && result.results.length) {
        console.log(`[autoTradingJob] tick: ${JSON.stringify(result.results)}`);
      }
    } catch (err) {
      console.error('[autoTradingJob] tick failed:', err);
    } finally {
      running = false;
    }
  });
  console.log('[autoTradingJob] scheduled (every 30s)');
}

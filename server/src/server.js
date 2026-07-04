import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { ensureSeedData } from './models/seed.js';
import { defaultUser } from './middleware/defaultUser.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRoutes } from './routes/index.js';
import { startAutoTradingJob } from './jobs/autoTradingJob.js';
import { startBrokerHealthJob } from './jobs/brokerHealthJob.js';
import { startAiScanJob } from './jobs/aiScanJob.js';
import { startSquareOffJob } from './jobs/squareOffJob.js';
import { startPositionGuardianJob } from './jobs/positionGuardianJob.js';
import { startOrderReconciliationJob } from './jobs/orderReconciliationJob.js';

async function main() {
  await connectDb();
  await ensureSeedData();

  const app = express();
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json());
  app.use(defaultUser);
  app.use('/api', apiRoutes);
  app.use(errorHandler);

  app.listen(env.PORT, () => {
    console.log(`[server] GrowwAI v2 listening on http://localhost:${env.PORT}`);
  });

  startAutoTradingJob();
  startBrokerHealthJob();
  startAiScanJob();
  startSquareOffJob();
  startPositionGuardianJob();
  startOrderReconciliationJob();
}

main().catch((err) => {
  console.error('[server] fatal boot error:', err);
  process.exit(1);
});

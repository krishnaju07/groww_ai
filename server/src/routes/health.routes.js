import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { marketData } from '../services/marketData/index.js';

export const healthRoutes = Router();

healthRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const marketDataStatus = await marketData.getStatus();
    res.json({
      success: true,
      data: {
        status: 'ok',
        marketDataProvider: marketDataStatus.provider,
        marketDataDegraded: marketDataStatus.degraded,
        marketDataFallbackReason: marketDataStatus.lastFallbackReason,
        time: new Date(),
      },
    });
  }),
);

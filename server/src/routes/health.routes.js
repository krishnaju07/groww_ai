import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { marketData } from '../services/marketData/index.js';

export const healthRoutes = Router();

healthRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { status: 'ok', marketDataProvider: marketData.providerName, time: new Date() } });
  }),
);

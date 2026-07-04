import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getRecentTrades } from '../services/portfolioService.js';

export const tradesRoutes = Router();

tradesRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const data = await getRecentTrades(req.userId, limit);
    res.json({ success: true, data });
  }),
);

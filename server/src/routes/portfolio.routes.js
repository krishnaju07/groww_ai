import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getPortfolio } from '../services/portfolioService.js';

export const portfolioRoutes = Router();

portfolioRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await getPortfolio(req.userId);
    res.json({ success: true, data });
  }),
);

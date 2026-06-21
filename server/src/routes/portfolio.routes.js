import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getPortfolio } from '../services/portfolioService.js';

const router = Router();

/**
 * GET /api/portfolio — current portfolio summary + open positions.
 * @returns {import('../types.js').PortfolioResponse} data
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await getPortfolio(req.userId);
    res.json({ success: true, data });
  }),
);

export default router;

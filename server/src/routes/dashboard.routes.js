import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getEquityCurve, getPortfolio, getRecentTrades } from '../services/portfolioService.js';
import { getRiskMeter } from '../services/risk/riskMeterService.js';
import { STOCK_UNIVERSE } from '../config/constants.js';
import { marketData } from '../services/marketData/index.js';

export const dashboardRoutes = Router();

dashboardRoutes.get(
  '/equity-curve',
  asyncHandler(async (req, res) => {
    const data = await getEquityCurve(req.userId);
    res.json({ success: true, data });
  }),
);

dashboardRoutes.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const [portfolio, recentTrades, riskMeter] = await Promise.all([
      getPortfolio(req.userId),
      getRecentTrades(req.userId, 10),
      getRiskMeter(req.userId),
    ]);
    res.json({ success: true, data: { portfolio, recentTrades, riskMeter } });
  }),
);

dashboardRoutes.get(
  '/watchlist',
  asyncHandler(async (req, res) => {
    const symbols = STOCK_UNIVERSE.map((s) => s.symbol);
    const ltps = await marketData.getLTPBatch(symbols);
    const data = STOCK_UNIVERSE.map((s) => ({ ...s, ltp: ltps[s.symbol] ?? null }));
    res.json({ success: true, data });
  }),
);

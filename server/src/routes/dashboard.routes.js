import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getEquityCurve, getPortfolio, getRecentTrades } from '../services/portfolioService.js';
import { getRiskMeter } from '../services/risk/riskMeterService.js';
import { STOCK_UNIVERSE } from '../config/constants.js';
import { marketData } from '../services/marketData/index.js';
import { UserSettings } from '../models/UserSettings.js';
import { getEquityDetails } from '../services/instruments/instrumentService.js';

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

/** The user's personal focus watchlist (UserSettings.watchlist.equities), not the fixed STOCK_UNIVERSE default — the Trade page's StockSelector reads this. */
dashboardRoutes.get(
  '/watchlist',
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId } },
      { upsert: true, new: true },
    );
    const symbols = settings.watchlist.equities;
    const seedBySymbol = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s]));
    const [ltps, details] = await Promise.all([
      marketData.getLTPBatch(symbols),
      getEquityDetails(symbols.filter((s) => !seedBySymbol.has(s))),
    ]);
    const data = symbols.map((symbol) => {
      const seed = seedBySymbol.get(symbol);
      return {
        symbol,
        name: seed?.name ?? details[symbol]?.name ?? symbol,
        sector: seed?.sector ?? 'Other',
        ltp: ltps[symbol] ?? null,
      };
    });
    res.json({ success: true, data });
  }),
);

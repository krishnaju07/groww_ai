import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { marketData } from '../services/marketData/index.js';
import { STOCK_UNIVERSE } from '../config/constants.js';
import { searchEquities } from '../services/instruments/instrumentService.js';

export const stocksRoutes = Router();

stocksRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: STOCK_UNIVERSE });
  }),
);

const SearchQuerySchema = z.object({ q: z.string().min(1), limit: z.coerce.number().int().positive().max(50).optional() });

/** Searches the full real NSE equity universe (~2,300 stocks synced from Groww) by symbol/name — what the watchlist "add a stock" picker uses. */
stocksRoutes.get(
  '/search',
  validate(SearchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const results = await searchEquities(req.query.q, req.query.limit ?? 25);
    res.json({ success: true, data: results });
  }),
);

stocksRoutes.get(
  '/:symbol/ltp',
  asyncHandler(async (req, res) => {
    const ltp = await marketData.getLTP(req.params.symbol.toUpperCase());
    res.json({ success: true, data: { symbol: req.params.symbol.toUpperCase(), ltp } });
  }),
);

const CandlesQuerySchema = z.object({
  interval: z.enum(['1m', '5m', '15m', '30m', '1d']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

stocksRoutes.get(
  '/:symbol/candles',
  validate(CandlesQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { interval = '5m', limit = 100 } = req.query;
    const candles = await marketData.getCandles(req.params.symbol.toUpperCase(), interval, limit);
    res.json({ success: true, data: candles });
  }),
);

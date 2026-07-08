import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { runBacktest } from '../services/backtest/backtestEngine.js';
import { BacktestResult } from '../models/BacktestResult.js';
import { STOCK_UNIVERSE } from '../config/constants.js';

export const backtestRoutes = Router();

const RunBacktestSchema = z.object({
  symbol: z
    .string()
    .transform((s) => s.toUpperCase())
    .refine((s) => STOCK_UNIVERSE.some((u) => u.symbol === s), 'Unknown symbol'),
  interval: z.enum(['5m', '15m', '30m']).optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  startingCapital: z.number().positive().optional(),
  amountPerTrade: z.number().positive().optional(),
  minConfidence: z.number().min(0).max(100).optional(),
  stopLossPercent: z.number().positive().optional(),
  targetPercent: z.number().positive().optional(),
  trailingEnabled: z.boolean().optional(),
  trailingPercent: z.number().positive().optional(),
});

backtestRoutes.post(
  '/run',
  validate(RunBacktestSchema, 'body'),
  asyncHandler(async (req, res) => {
    const result = await runBacktest(req.userId, req.body);
    res.json({ success: true, data: result });
  }),
);

backtestRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const runs = await BacktestResult.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-trades -equityCurve');
    res.json({ success: true, data: runs });
  }),
);

backtestRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const run = await BacktestResult.findOne({ _id: req.params.id, userId: req.userId });
    if (!run) {
      const e = new Error('Backtest run not found.');
      e.status = 404;
      e.code = 'NOT_FOUND';
      throw e;
    }
    res.json({ success: true, data: run });
  }),
);

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { STOCK_UNIVERSE, VALIDATION } from '../config/constants.js';
import { runBacktest } from '../services/backtestService.js';
import BacktestResult from '../models/BacktestResult.js';

const router = Router();

/** Set of canonical symbols for O(1) membership checks. */
const SYMBOLS = new Set(STOCK_UNIVERSE.map((s) => s.symbol));

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const backtestParamsSchema = z
  .object({
    symbol: z
      .string()
      .transform((s) => s.toUpperCase())
      .refine((s) => SYMBOLS.has(s), { message: 'Unknown symbol' }),
    startDate: dateString,
    endDate: dateString,
    initialCapital: z.coerce.number().positive(),
    perTradeAmount: z.coerce.number().positive(),
    minConfidenceScore: z.coerce
      .number()
      .min(VALIDATION.confidence.min)
      .max(VALIDATION.confidence.max),
    stopLossPercent: z.coerce
      .number()
      .min(VALIDATION.stopLoss.min)
      .max(VALIDATION.stopLoss.max),
    takeProfitPercent: z.coerce
      .number()
      .min(VALIDATION.takeProfit.min)
      .max(VALIDATION.takeProfit.max),
    trailingStopPercent: z.coerce
      .number()
      .min(VALIDATION.trailing.min)
      .max(VALIDATION.trailing.max),
  })
  .strict();

/**
 * Map a BacktestResult Mongoose doc/lean object to the BacktestResult DTO.
 * @param {*} doc
 * @returns {import('../types.js').BacktestResult}
 */
function mapResultDoc(doc) {
  return {
    id: doc.resultId,
    params: doc.params,
    totalReturnPercent: doc.totalReturnPercent,
    finalCapital: doc.finalCapital,
    maxDrawdownPercent: doc.maxDrawdownPercent,
    winRate: doc.winRate,
    totalTrades: doc.totalTrades,
    sharpeRatio: doc.sharpeRatio,
    equityCurve: doc.equityCurve || [],
    trades: doc.trades || [],
    createdAt: doc.createdAt
      ? new Date(doc.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * POST /api/backtest — run a backtest over a symbol/date range.
 * Body: BacktestParams
 * @returns {import('../types.js').BacktestResult} data
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = backtestParamsSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new Error(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ') || 'Invalid backtest parameters',
      );
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      const err = new Error('endDate must be on or after startDate');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    const data = await runBacktest(parsed.data);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/backtest/results/:id — fetch a persisted backtest result.
 * @returns {import('../types.js').BacktestResult} data
 */
router.get(
  '/results/:id',
  asyncHandler(async (req, res) => {
    const doc = await BacktestResult.findOne({ resultId: req.params.id }).lean();
    if (!doc) {
      const err = new Error(`Backtest result not found: ${req.params.id}`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
    res.json({ success: true, data: mapResultDoc(doc) });
  }),
);

export default router;

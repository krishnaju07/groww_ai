import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { STOCK_UNIVERSE } from '../config/constants.js';
import { executeTrade, mapTradeDoc } from '../services/tradeService.js';
import Trade from '../models/Trade.js';

const router = Router();

/** Set of canonical symbols for O(1) membership checks. */
const SYMBOLS = new Set(STOCK_UNIVERSE.map((s) => s.symbol));

const manualTradeSchema = z
  .object({
    symbol: z
      .string()
      .transform((s) => s.toUpperCase())
      .refine((s) => SYMBOLS.has(s), { message: 'Unknown symbol' }),
    action: z.enum(['BUY', 'SELL']),
    // Required and > 0 for BUY; ignored for SELL, which closes the whole position.
    investmentAmount: z.coerce.number().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'BUY' && !(data.investmentAmount > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['investmentAmount'],
        message: 'investmentAmount must be greater than 0 for BUY',
      });
    }
  });

const listQuerySchema = z.object({
  type: z.enum(['manual', 'automatic', 'all']).optional().default('all'),
  status: z.enum(['OPEN', 'CLOSED', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});

/**
 * POST /api/trades/manual — execute a manual BUY/SELL.
 * Body: { symbol, action, investmentAmount }
 * @returns {import('../types.js').Trade} data
 */
router.post(
  '/manual',
  asyncHandler(async (req, res) => {
    const parsed = manualTradeSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new Error(
        parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid trade request',
      );
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    const { symbol, action, investmentAmount } = parsed.data;
    const data = await executeTrade({
      userId: req.userId,
      symbol,
      action,
      investmentAmount,
      tradeType: 'manual',
      triggerReason: 'Manual trade',
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/trades?type=&status=&limit= — list trades for the user.
 * @returns {import('../types.js').Trade[]} data
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const err = new Error('Invalid query parameters');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    const { type, status, limit } = parsed.data;
    const filter = { userId: req.userId };
    if (type !== 'all') filter.tradeType = type;
    if (status !== 'all') filter.status = status;
    const docs = await Trade.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    const data = docs.map((d) => mapTradeDoc(d));
    res.json({ success: true, data });
  }),
);

export default router;

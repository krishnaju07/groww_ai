import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { STOCK_UNIVERSE } from '../config/constants.js';
import { marketData } from '../services/marketData/index.js';
import { getSignal } from '../services/aiSignalService.js';

const router = Router();

/** Set of canonical symbols for O(1) membership checks. */
const SYMBOLS = new Set(STOCK_UNIVERSE.map((s) => s.symbol));

/**
 * Assert that a route :symbol param exists in STOCK_UNIVERSE.
 * @param {string} symbol
 * @returns {string} the validated canonical symbol
 * @throws {Error} with `.code='SYMBOL_NOT_FOUND'` and `.status=404` when unknown
 */
function assertSymbol(symbol) {
  const canonical = String(symbol || '').toUpperCase();
  if (!SYMBOLS.has(canonical)) {
    const err = new Error(`Unknown symbol: ${symbol}`);
    err.code = 'SYMBOL_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return canonical;
}

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

/**
 * GET /api/stocks — all universe quotes.
 * @returns {import('../types.js').StockQuote[]} data
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const data = await marketData.getAllQuotes();
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/stocks/:symbol/signal — AI signal for a symbol.
 * @returns {import('../types.js').AISignal} data
 */
router.get(
  '/:symbol/signal',
  asyncHandler(async (req, res) => {
    const symbol = assertSymbol(req.params.symbol);
    const data = await getSignal(symbol);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/stocks/:symbol/history?days=30 — daily candles for a symbol.
 * @returns {import('../types.js').Candle[]} data
 */
router.get(
  '/:symbol/history',
  asyncHandler(async (req, res) => {
    const symbol = assertSymbol(req.params.symbol);
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const err = new Error('Invalid query parameters');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    const data = await marketData.getHistory(symbol, parsed.data.days);
    res.json({ success: true, data });
  }),
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { loadSettingsDoc } from './settings.routes.js';
import { getTradingModeStatus, isLiveConfigured } from '../services/brokers/index.js';

const router = Router();

const modeSchema = z.object({ mode: z.enum(['paper', 'live']) });

/**
 * GET /api/trading-mode — current mode + live availability/gating flags.
 * @returns {import('../types.js').TradingModeStatus} data
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await loadSettingsDoc(req.userId);
    res.json({ success: true, data: getTradingModeStatus(settings) });
  }),
);

/**
 * PUT /api/trading-mode { mode } — switch between paper and live.
 * Switching to live is refused (403 LIVE_TRADING_DISABLED) unless the server is
 * fully configured (ENABLE_LIVE_TRADING=true + a valid GROWW_ACCESS_TOKEN).
 * @returns {import('../types.js').TradingModeStatus} data
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) {
      const e = new Error('mode must be "paper" or "live"');
      e.code = 'VALIDATION_ERROR';
      e.status = 400;
      throw e;
    }
    const { mode } = parsed.data;
    if (mode === 'live' && !isLiveConfigured()) {
      const e = new Error(
        'Live trading is not available: set ENABLE_LIVE_TRADING=true and a valid GROWW_ACCESS_TOKEN on the server, then try again.',
      );
      e.code = 'LIVE_TRADING_DISABLED';
      e.status = 403;
      throw e;
    }
    const settings = await loadSettingsDoc(req.userId);
    settings.tradingMode = mode;
    await settings.save();
    res.json({ success: true, data: getTradingModeStatus(settings) });
  }),
);

export default router;

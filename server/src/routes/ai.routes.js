import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { decide } from '../services/ai/decisionEngine.js';
import { AIDecisionLog } from '../models/AIDecisionLog.js';
import { STOCK_UNIVERSE } from '../config/constants.js';

export const aiRoutes = Router();

aiRoutes.post(
  '/decide/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    if (!STOCK_UNIVERSE.some((s) => s.symbol === symbol)) {
      const e = new Error(`Unknown symbol: ${symbol}`);
      e.code = 'UNKNOWN_SYMBOL';
      e.status = 400;
      throw e;
    }
    const decision = await decide(req.userId, symbol);
    res.json({ success: true, data: decision });
  }),
);

aiRoutes.get(
  '/decisions',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const filter = { userId: req.userId };
    if (req.query.symbol) filter.symbol = String(req.query.symbol).toUpperCase();
    if (req.query.action) filter.action = req.query.action;
    const data = await AIDecisionLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, data });
  }),
);

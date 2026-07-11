import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { getPeriodReport, getLearningInsights } from '../services/analyticsService.js';
import { TradeCritique } from '../models/TradeCritique.js';

export const reportsRoutes = Router();

const PeriodQuerySchema = z.object({ period: z.enum(['daily', 'weekly', 'monthly']).optional() });

/** Daily/weekly/monthly trade report — profit, win-rate, best/worst hour, AI accuracy. */
reportsRoutes.get(
  '/',
  validate(PeriodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const data = await getPeriodReport(req.userId, req.query.period ?? 'daily');
    res.json({ success: true, data });
  }),
);

/** Learning-engine insights — which conditions the AI's closed trades actually made money under. */
reportsRoutes.get(
  '/learning',
  asyncHandler(async (req, res) => {
    const data = await getLearningInsights(req.userId);
    res.json({ success: true, data });
  }),
);

/** The AI's self-critiques of its own recent closed trades (most recent first). */
reportsRoutes.get(
  '/critiques',
  asyncHandler(async (req, res) => {
    const data = await TradeCritique.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30).lean();
    res.json({ success: true, data });
  }),
);

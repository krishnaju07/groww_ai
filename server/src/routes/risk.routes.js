import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { getRiskConfig, updateRiskConfig } from '../services/risk/riskConfig.js';
import { getRiskMeter } from '../services/risk/riskMeterService.js';
import { trip, reset } from '../services/risk/killSwitch.js';
import { RiskEvent } from '../models/RiskEvent.js';

export const riskRoutes = Router();

riskRoutes.get(
  '/config',
  asyncHandler(async (req, res) => {
    const data = await getRiskConfig(req.userId);
    res.json({ success: true, data });
  }),
);

const RiskConfigPatchSchema = z.object({
  maxLossPerDay: z.coerce.number().positive().optional(),
  maxLossPerTrade: z.coerce.number().positive().optional(),
  maxTradesPerDay: z.coerce.number().int().positive().optional(),
  maxCapitalPerTradePercent: z.coerce.number().positive().max(100).optional(),
  dailyProfitLockPercent: z.coerce.number().min(0).max(100).optional(),
  dailyProfitTarget: z.coerce.number().min(0).optional(),
  maxConsecutiveLosses: z.coerce.number().int().min(0).optional(),
});

riskRoutes.put(
  '/config',
  validate(RiskConfigPatchSchema),
  asyncHandler(async (req, res) => {
    const data = await updateRiskConfig(req.userId, req.body);
    res.json({ success: true, data });
  }),
);

riskRoutes.get(
  '/meter',
  asyncHandler(async (req, res) => {
    const data = await getRiskMeter(req.userId);
    res.json({ success: true, data });
  }),
);

riskRoutes.get(
  '/events',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const data = await RiskEvent.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, data });
  }),
);

riskRoutes.post(
  '/kill-switch/trip',
  asyncHandler(async (req, res) => {
    const data = await trip(req.userId, req.body?.reason ?? 'manual');
    res.json({ success: true, data });
  }),
);

riskRoutes.post(
  '/kill-switch/reset',
  asyncHandler(async (req, res) => {
    await reset(req.userId);
    res.json({ success: true, data: { killSwitchEngaged: false } });
  }),
);

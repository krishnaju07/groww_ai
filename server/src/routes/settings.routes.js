import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { UserSettings } from '../models/UserSettings.js';
import { getTradingModeStatus } from '../services/brokers/tradingModeService.js';
import { BROKERS, TRADING_MODES } from '../config/constants.js';

export const settingsRoutes = Router();

settingsRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId } },
      { upsert: true, new: true },
    );
    res.json({ success: true, data: settings });
  }),
);

const SettingsPatchSchema = z.object({
  minInvestment: z.coerce.number().positive().optional(),
  maxInvestment: z.coerce.number().positive().optional(),
  autoInvest: z
    .object({
      enabled: z.boolean().optional(),
      amountPerTrade: z.coerce.number().positive().optional(),
      maxOpenPositions: z.coerce.number().int().positive().optional(),
    })
    .partial()
    .optional(),
  autoExit: z
    .object({
      enabled: z.boolean().optional(),
      stopLossPercent: z.coerce.number().positive().optional(),
      targetPercent: z.coerce.number().positive().optional(),
      trailingEnabled: z.boolean().optional(),
      trailingPercent: z.coerce.number().positive().optional(),
    })
    .partial()
    .optional(),
});

settingsRoutes.put(
  '/',
  validate(SettingsPatchSchema),
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate({ userId: req.userId }, req.body, {
      upsert: true,
      new: true,
    });
    res.json({ success: true, data: settings });
  }),
);

const TradingModeSchema = z.object({
  tradingMode: z.enum(TRADING_MODES).optional(),
  activeBroker: z.enum(BROKERS).optional(),
});

settingsRoutes.get(
  '/trading-mode',
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId } },
      { upsert: true, new: true },
    );
    const data = await getTradingModeStatus(req.userId, settings);
    res.json({ success: true, data });
  }),
);

settingsRoutes.put(
  '/trading-mode',
  validate(TradingModeSchema),
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate({ userId: req.userId }, req.body, {
      upsert: true,
      new: true,
    });
    const data = await getTradingModeStatus(req.userId, settings);
    res.json({ success: true, data });
  }),
);

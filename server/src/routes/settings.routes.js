import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { UserSettings } from '../models/UserSettings.js';
import { getTradingModeStatus } from '../services/brokers/tradingModeService.js';
import { BROKERS, TRADING_MODES, AI_PROVIDERS } from '../config/constants.js';
import { env } from '../config/env.js';

export const settingsRoutes = Router();

settingsRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId } },
      { upsert: true, new: true },
    );
    res.json({ success: true, data: { ...settings.toObject(), aiScanIntervalMinutes: env.AI_SCAN_INTERVAL_MINUTES } });
  }),
);

const SettingsPatchSchema = z.object({
  minInvestment: z.coerce.number().positive().optional(),
  maxInvestment: z.coerce.number().positive().optional(),
  aiProvider: z.enum(AI_PROVIDERS).optional(),
  autoInvest: z
    .object({
      enabled: z.boolean().optional(),
      amountPerTrade: z.coerce.number().positive().optional(),
      maxOpenPositions: z.coerce.number().int().positive().optional(),
      requireAiConfirmation: z.boolean().optional(),
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

/**
 * A plain `findOneAndUpdate(filter, {autoInvest: {enabled: true}})` REPLACES the
 * whole `autoInvest` subdocument, silently wiping sibling fields the caller
 * didn't send (e.g. amountPerTrade, requireAiConfirmation). Flatten nested
 * sub-objects into dot-notation so each PUT only touches the fields it sent.
 * @param {object} body
 * @returns {object} a $set-ready update document
 */
function flattenSettingsUpdate(body) {
  const update = {};
  for (const [key, value] of Object.entries(body)) {
    if (['autoInvest', 'autoExit'].includes(key) && value && typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value)) {
        update[`${key}.${subKey}`] = subValue;
      }
    } else {
      update[key] = value;
    }
  }
  return update;
}

settingsRoutes.put(
  '/',
  validate(SettingsPatchSchema),
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $set: flattenSettingsUpdate(req.body) },
      { upsert: true, new: true },
    );
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

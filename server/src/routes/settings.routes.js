import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { UserSettings } from '../models/UserSettings.js';
import { getTradingModeStatus } from '../services/brokers/tradingModeService.js';
import { invalidateSystemConfigCache } from '../services/config/systemConfig.js';
import { getRecordsSummary, clearRecords, getAiCallRecordsSummary, clearAiCallRecords } from '../services/recordsService.js';
import { BROKERS, TRADING_MODES, AI_PROVIDERS, MARKET_DATA_PROVIDERS, AI_MODEL_OPTIONS } from '../config/constants.js';

export const settingsRoutes = Router();

const CONFIRM_LIVE_AUTO_TRADING_PHRASE = 'ENABLE LIVE AUTO TRADING';
const CONFIRM_CLEAR_LIVE_RECORDS_PHRASE = 'DELETE LIVE RECORDS';

settingsRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId } },
      { upsert: true, new: true },
    );
    res.json({ success: true, data: settings.toObject() });
  }),
);

const SettingsPatchSchema = z.object({
  aiProvider: z.enum(AI_PROVIDERS).optional(),
  // Not restricted to AI_MODEL_OPTIONS's curated list — a user may want to type a
  // model id a provider shipped after that list was last updated. Empty string means
  // "use the provider's env-configured default" (see decisionEngine.js).
  aiModel: z.string().optional(),
  autoInvest: z
    .object({
      enabled: z.boolean().optional(),
      amountPerTrade: z.coerce.number().positive().optional(),
      maxOpenPositions: z.coerce.number().int().positive().optional(),
      requireAiConfirmation: z.boolean().optional(),
      minConfidence: z.coerce.number().min(0).max(100).optional(),
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
      moveSlToCostAtPercent: z.coerce.number().min(0).optional(),
      partialBookAtPercent: z.coerce.number().min(0).optional(),
      partialBookFraction: z.coerce.number().min(0).max(1).optional(),
      maxHoldMinutes: z.coerce.number().min(0).optional(),
    })
    .partial()
    .optional(),
  systemConfig: z
    .object({
      enableLiveTrading: z.boolean().optional(),
      enableLiveAutoTrading: z.boolean().optional(),
      liveMaxOrderValue: z.coerce.number().positive().optional(),
      autoTradingEnabled: z.boolean().optional(),
      ignoreMarketHours: z.boolean().optional(),
      marketDataProvider: z.enum(MARKET_DATA_PROVIDERS).optional(),
      aiScanIntervalMinutes: z.coerce.number().positive().optional(),
      newsMaxAgeHours: z.coerce.number().positive().optional(),
      newsHeadlineCount: z.coerce.number().int().positive().optional(),
      avoidFirstMinutes: z.coerce.number().min(0).optional(),
      skipLunchHour: z.boolean().optional(),
      stopNewTradesAfter: z.string().regex(/^\d{1,2}:\d{2}$/, 'Must be HH:MM').optional(),
      avoidExpiryDay: z.boolean().optional(),
      regimeFilterEnabled: z.boolean().optional(),
      opportunityScoreThreshold: z.coerce.number().min(0).max(100).optional(),
      consensusEnabled: z.boolean().optional(),
      consensusMinAgree: z.coerce.number().int().min(1).optional(),
      learningGateEnabled: z.boolean().optional(),
      learningMinSample: z.coerce.number().int().min(2).optional(),
      volatilityStraddleEnabled: z.boolean().optional(),
      autoTradingFocus: z.enum(['EQUITY', 'OPTIONS', 'BOTH']).optional(),
      // Not persisted — only checked when enabling enableLiveAutoTrading, then discarded.
      confirmPhrase: z.string().optional(),
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
    if (['autoInvest', 'autoExit', 'systemConfig'].includes(key) && value && typeof value === 'object') {
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
    const { systemConfig, ...rest } = req.body;

    // Enabling unattended real-money trading is the single highest-stakes toggle in
    // the app — require a typed confirmation phrase, not just a click, same spirit
    // as the per-order REAL MONEY modal. Only gates the false->true transition.
    if (systemConfig?.enableLiveAutoTrading === true) {
      if (systemConfig.confirmPhrase !== CONFIRM_LIVE_AUTO_TRADING_PHRASE) {
        const e = new Error(`Type "${CONFIRM_LIVE_AUTO_TRADING_PHRASE}" exactly to confirm enabling unattended live-money trading.`);
        e.code = 'CONFIRMATION_REQUIRED';
        e.status = 400;
        throw e;
      }
    }
    if (systemConfig) delete systemConfig.confirmPhrase; // never persisted — one-shot gate only

    const body = systemConfig ? { ...rest, systemConfig } : rest;
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $set: flattenSettingsUpdate(body) },
      { upsert: true, new: true },
    );
    invalidateSystemConfigCache();
    res.json({ success: true, data: settings });
  }),
);

const TradingModeSchema = z.object({
  tradingMode: z.enum(TRADING_MODES).optional(),
  activeBroker: z.enum(BROKERS).optional(),
});

/** Curated cheap/balanced/flagship model choices per AI provider — powers the model dropdown next to "AI Provider" in Settings. */
settingsRoutes.get(
  '/ai-model-options',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: AI_MODEL_OPTIONS });
  }),
);

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

/** Danger Zone (Settings) — how many AI call/decision records exist (AIDecisionLog: every decide()/decideOptions() call, including WAIT). Registered before the /records/:mode wildcard below so 'ai-calls' doesn't get swallowed as a `mode` value. */
settingsRoutes.get(
  '/records/ai-calls',
  asyncHandler(async (req, res) => {
    const data = await getAiCallRecordsSummary(req.userId);
    res.json({ success: true, data });
  }),
);

/** Danger Zone (Settings) — permanently deletes the AI call/decision log. Not financial data, so a click is enough (no typed phrase). */
settingsRoutes.post(
  '/records/ai-calls/clear',
  asyncHandler(async (req, res) => {
    const data = await clearAiCallRecords(req.userId);
    res.json({ success: true, data });
  }),
);

const RecordsModeParamsSchema = z.object({ mode: z.enum(TRADING_MODES) });

/** Danger Zone (Settings) — how many trade/order/open-position rows exist for a mode, before offering to clear them. */
settingsRoutes.get(
  '/records/:mode',
  validate(RecordsModeParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const data = await getRecordsSummary(req.userId, req.params.mode);
    res.json({ success: true, data });
  }),
);

const ClearRecordsSchema = z.object({
  mode: z.enum(TRADING_MODES),
  confirmPhrase: z.string().optional(),
});

/**
 * Danger Zone (Settings) — permanently deletes a mode's Trade/Order/TradeCritique history
 * (paper mode also resets the paper cash balance). Clearing LIVE records deletes real
 * financial history, so — same spirit as enabling unattended live auto-trading above — it
 * requires a typed confirmation phrase, not just a click. Paper is fake money; a click is enough.
 */
settingsRoutes.post(
  '/records/clear',
  validate(ClearRecordsSchema),
  asyncHandler(async (req, res) => {
    const { mode, confirmPhrase } = req.body;
    if (mode === 'live' && confirmPhrase !== CONFIRM_CLEAR_LIVE_RECORDS_PHRASE) {
      const e = new Error(`Type "${CONFIRM_CLEAR_LIVE_RECORDS_PHRASE}" exactly to permanently delete live trade records.`);
      e.code = 'CONFIRMATION_REQUIRED';
      e.status = 400;
      throw e;
    }
    const data = await clearRecords(req.userId, mode);
    res.json({ success: true, data });
  }),
);

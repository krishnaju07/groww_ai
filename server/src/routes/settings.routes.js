import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { VALIDATION, DEFAULT_SETTINGS } from '../config/constants.js';
import UserSettings from '../models/UserSettings.js';

const router = Router();

/**
 * Map a UserSettings Mongoose doc (or plain default) to the UserSettings DTO.
 * @param {string} userId
 * @param {*} doc  Mongoose doc / lean object, or null for defaults
 * @returns {import('../types.js').UserSettings}
 */
export function mapSettingsDoc(userId, doc) {
  const src = doc || DEFAULT_SETTINGS;
  const ai = src.autoInvest || DEFAULT_SETTINGS.autoInvest;
  const ax = src.autoExit || DEFAULT_SETTINGS.autoExit;
  return {
    userId: String(userId),
    minInvestment: src.minInvestment,
    maxInvestment: src.maxInvestment,
    tradingMode: src.tradingMode === 'live' ? 'live' : 'paper',
    autoInvest: {
      enabled: Boolean(ai.enabled),
      minConfidenceScore: ai.minConfidenceScore,
      ...(ai.lastExecutedAt
        ? { lastExecutedAt: new Date(ai.lastExecutedAt).toISOString() }
        : {}),
    },
    autoExit: {
      enabled: Boolean(ax.enabled),
      stopLossPercent: ax.stopLossPercent,
      takeProfitPercent: ax.takeProfitPercent,
      trailingStopPercent: ax.trailingStopPercent,
      useAiExitSignal: Boolean(ax.useAiExitSignal),
    },
    updatedAt: (doc && doc.updatedAt
      ? new Date(doc.updatedAt)
      : new Date()
    ).toISOString(),
  };
}

/**
 * Load the user's settings doc, creating defaults on first access.
 * @param {string} userId
 * @returns {Promise<*>} the UserSettings Mongoose doc
 */
export async function loadSettingsDoc(userId) {
  let doc = await UserSettings.findOne({ userId });
  if (!doc) {
    doc = await UserSettings.create({ userId, ...DEFAULT_SETTINGS });
  }
  return doc;
}

const autoInvestSchema = z
  .object({
    enabled: z.boolean().optional(),
    minConfidenceScore: z
      .number()
      .min(VALIDATION.confidence.min)
      .max(VALIDATION.confidence.max)
      .optional(),
  })
  .strip();

const autoExitSchema = z
  .object({
    enabled: z.boolean().optional(),
    stopLossPercent: z
      .number()
      .min(VALIDATION.stopLoss.min)
      .max(VALIDATION.stopLoss.max)
      .optional(),
    takeProfitPercent: z
      .number()
      .min(VALIDATION.takeProfit.min)
      .max(VALIDATION.takeProfit.max)
      .optional(),
    trailingStopPercent: z
      .number()
      .min(VALIDATION.trailing.min)
      .max(VALIDATION.trailing.max)
      .optional(),
    useAiExitSignal: z.boolean().optional(),
  })
  .strip();

const updateSchema = z
  .object({
    minInvestment: z.number().optional(),
    maxInvestment: z.number().optional(),
    autoInvest: autoInvestSchema.optional(),
    autoExit: autoExitSchema.optional(),
  })
  .strip();

/**
 * Build a VALIDATION_ERROR for the global error handler.
 * @param {string} message
 * @returns {Error}
 */
function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.status = 400;
  return err;
}

/**
 * GET /api/settings — current user settings (DTO).
 * @returns {import('../types.js').UserSettings} data
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const doc = await loadSettingsDoc(req.userId);
    res.json({ success: true, data: mapSettingsDoc(req.userId, doc) });
  }),
);

/**
 * PUT /api/settings — partial update of user settings.
 * Enforces §2 VALIDATION ranges + maxInvestment > minInvestment + minInvestment >= floor.
 * @returns {import('../types.js').UserSettings} data
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ') || 'Invalid settings',
      );
    }
    const patch = parsed.data;

    const doc = await loadSettingsDoc(req.userId);

    // Merge patch onto current values to validate the resulting state.
    const nextMin =
      patch.minInvestment !== undefined ? patch.minInvestment : doc.minInvestment;
    const nextMax =
      patch.maxInvestment !== undefined ? patch.maxInvestment : doc.maxInvestment;

    if (nextMin < VALIDATION.minInvestmentFloor) {
      throw validationError(
        `minInvestment must be >= ${VALIDATION.minInvestmentFloor}`,
      );
    }
    if (nextMax <= nextMin) {
      throw validationError('maxInvestment must be greater than minInvestment');
    }

    // Apply the validated patch.
    doc.minInvestment = nextMin;
    doc.maxInvestment = nextMax;

    if (patch.autoInvest) {
      if (patch.autoInvest.enabled !== undefined) {
        doc.autoInvest.enabled = patch.autoInvest.enabled;
      }
      if (patch.autoInvest.minConfidenceScore !== undefined) {
        doc.autoInvest.minConfidenceScore = patch.autoInvest.minConfidenceScore;
      }
    }
    if (patch.autoExit) {
      if (patch.autoExit.enabled !== undefined) {
        doc.autoExit.enabled = patch.autoExit.enabled;
      }
      if (patch.autoExit.stopLossPercent !== undefined) {
        doc.autoExit.stopLossPercent = patch.autoExit.stopLossPercent;
      }
      if (patch.autoExit.takeProfitPercent !== undefined) {
        doc.autoExit.takeProfitPercent = patch.autoExit.takeProfitPercent;
      }
      if (patch.autoExit.trailingStopPercent !== undefined) {
        doc.autoExit.trailingStopPercent = patch.autoExit.trailingStopPercent;
      }
      if (patch.autoExit.useAiExitSignal !== undefined) {
        doc.autoExit.useAiExitSignal = patch.autoExit.useAiExitSignal;
      }
    }

    await doc.save();
    res.json({ success: true, data: mapSettingsDoc(req.userId, doc) });
  }),
);

export default router;

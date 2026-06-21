import mongoose from 'mongoose';
import User from './User.js';
import UserSettings from './UserSettings.js';
import { DEFAULT_USER_ID, DEFAULT_USER, DEFAULT_SETTINGS } from '../config/constants.js';

/**
 * Idempotently ensure the single demo user and its default settings exist.
 * Upserts DEFAULT_USER at the fixed _id = DEFAULT_USER_ID with
 * cashBalance = initialCapital and realizedPnl = 0, then upserts the
 * default UserSettings for that user. Called once after DB connect.
 *
 * @returns {Promise<{ userId: string }>}
 */
export async function ensureSeedData() {
  const userId = new mongoose.Types.ObjectId(DEFAULT_USER_ID);

  await User.updateOne(
    { _id: userId },
    {
      $setOnInsert: {
        name: DEFAULT_USER.name,
        email: DEFAULT_USER.email,
        cashBalance: DEFAULT_USER.initialCapital,
        initialCapital: DEFAULT_USER.initialCapital,
        realizedPnl: 0,
      },
    },
    { upsert: true }
  );

  await UserSettings.updateOne(
    { userId },
    {
      $setOnInsert: {
        userId,
        minInvestment: DEFAULT_SETTINGS.minInvestment,
        maxInvestment: DEFAULT_SETTINGS.maxInvestment,
        autoInvest: {
          enabled: DEFAULT_SETTINGS.autoInvest.enabled,
          minConfidenceScore: DEFAULT_SETTINGS.autoInvest.minConfidenceScore,
        },
        autoExit: {
          enabled: DEFAULT_SETTINGS.autoExit.enabled,
          stopLossPercent: DEFAULT_SETTINGS.autoExit.stopLossPercent,
          takeProfitPercent: DEFAULT_SETTINGS.autoExit.takeProfitPercent,
          trailingStopPercent: DEFAULT_SETTINGS.autoExit.trailingStopPercent,
          useAiExitSignal: DEFAULT_SETTINGS.autoExit.useAiExitSignal,
        },
      },
    },
    { upsert: true }
  );

  return { userId: DEFAULT_USER_ID };
}

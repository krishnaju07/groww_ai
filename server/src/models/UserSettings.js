import mongoose from 'mongoose';
import { BROKERS, TRADING_MODES } from '../config/constants.js';

const UserSettingsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },

    tradingMode: { type: String, enum: TRADING_MODES, default: 'paper' },
    activeBroker: { type: String, enum: BROKERS, default: 'paper' },

    minInvestment: { type: Number, default: 1000 },
    maxInvestment: { type: Number, default: 20000 },

    autoInvest: {
      enabled: { type: Boolean, default: false },
      amountPerTrade: { type: Number, default: 5000 },
      maxOpenPositions: { type: Number, default: 3 },
    },
    autoExit: {
      enabled: { type: Boolean, default: true },
      stopLossPercent: { type: Number, default: 2 },
      targetPercent: { type: Number, default: 4 },
      trailingEnabled: { type: Boolean, default: false },
      trailingPercent: { type: Number, default: 1.5 },
    },
  },
  { timestamps: true },
);

export const UserSettings =
  mongoose.models.UserSettings || mongoose.model('UserSettings', UserSettingsSchema);

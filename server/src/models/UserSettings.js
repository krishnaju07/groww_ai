import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Auto-invest configuration nested in UserSettings.
 */
const autoInvestSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    minConfidenceScore: { type: Number, default: 75 },
    lastExecutedAt: { type: Date },
  },
  { _id: false }
);

/**
 * Auto-exit configuration nested in UserSettings.
 */
const autoExitSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    stopLossPercent: { type: Number, default: 2.5 },
    takeProfitPercent: { type: Number, default: 5 },
    trailingStopPercent: { type: Number, default: 1.5 },
    useAiExitSignal: { type: Boolean, default: true },
  },
  { _id: false }
);

/**
 * Per-user trading preferences: investment limits + auto-trading rules.
 */
const userSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    minInvestment: { type: Number, required: true },
    maxInvestment: { type: Number, required: true },
    tradingMode: { type: String, enum: ['paper', 'live'], default: 'paper' },
    autoInvest: { type: autoInvestSchema, default: () => ({}) },
    autoExit: { type: autoExitSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const UserSettings = model('UserSettings', userSettingsSchema);

export default UserSettings;

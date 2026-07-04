import mongoose from 'mongoose';

const RiskConfigSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    maxLossPerDay: { type: Number, required: true },
    maxLossPerTrade: { type: Number, required: true },
    maxTradesPerDay: { type: Number, required: true },
    maxCapitalPerTradePercent: { type: Number, required: true },
    killSwitchEngaged: { type: Boolean, default: false },
    killSwitchReason: { type: String, default: '' },
    killSwitchAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const RiskConfig = mongoose.models.RiskConfig || mongoose.model('RiskConfig', RiskConfigSchema);

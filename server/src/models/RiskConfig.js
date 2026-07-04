import mongoose from 'mongoose';

const RiskConfigSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    maxLossPerDay: { type: Number, required: true },
    maxLossPerTrade: { type: Number, required: true },
    maxTradesPerDay: { type: Number, required: true },
    maxCapitalPerTradePercent: { type: Number, required: true },
    // Once today's realized profit reaches this % of starting capital, new BUY entries
    // are blocked for the rest of the day (locks in the day's gain) — 0 disables it.
    // SELLs (closing positions, incl. auto square-off) are never blocked by this.
    dailyProfitLockPercent: { type: Number, default: 2 },
    killSwitchEngaged: { type: Boolean, default: false },
    killSwitchReason: { type: String, default: '' },
    killSwitchAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const RiskConfig = mongoose.models.RiskConfig || mongoose.model('RiskConfig', RiskConfigSchema);

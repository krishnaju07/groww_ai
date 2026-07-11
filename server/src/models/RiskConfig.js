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
    // GrowwAI's Golden Rule made concrete: an absolute-₹ daily profit target. Once
    // today's realized PnL reaches this, new entries stop for the day ("never continue
    // trading due to greed") — existing positions keep being managed to close. Takes
    // precedence over dailyProfitLockPercent when > 0. 0 disables it. Default ₹1000.
    dailyProfitTarget: { type: Number, default: 1000 },
    // Stop opening new positions after this many consecutive losing trades today
    // ("no revenge trading" / "stop after consecutive losses"). Counts back from the
    // most recent closed trade until a winner breaks the streak. 0 disables it.
    maxConsecutiveLosses: { type: Number, default: 3 },
    killSwitchEngaged: { type: Boolean, default: false },
    killSwitchReason: { type: String, default: '' },
    killSwitchAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const RiskConfig = mongoose.models.RiskConfig || mongoose.model('RiskConfig', RiskConfigSchema);

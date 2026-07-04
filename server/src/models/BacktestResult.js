import mongoose from 'mongoose';

const BacktestResultSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    symbol: { type: String, required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    startingCapital: { type: Number, required: true },
    endingCapital: { type: Number, required: true },
    totalTrades: { type: Number, default: 0 },
    winCount: { type: Number, default: 0 },
    lossCount: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    totalPnl: { type: Number, default: 0 },
    totalPnlPercent: { type: Number, default: 0 },
    maxDrawdownPercent: { type: Number, default: 0 },
    equityCurve: [
      {
        time: { type: Date, required: true },
        equity: { type: Number, required: true },
      },
    ],
    trades: [
      {
        symbol: String,
        action: String,
        quantity: Number,
        price: Number,
        pnl: Number,
        time: Date,
      },
    ],
  },
  { timestamps: true },
);

BacktestResultSchema.index({ userId: 1, createdAt: -1 });

export const BacktestResult =
  mongoose.models.BacktestResult || mongoose.model('BacktestResult', BacktestResultSchema);

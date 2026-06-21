import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Persisted output of a backtest run (mirrors the BacktestResult DTO).
 * The DTO `id` is stored here as `resultId`; nested params/equityCurve/trades
 * are stored as Mixed since their shapes are owned by the backtest service.
 */
const backtestResultSchema = new Schema(
  {
    resultId: { type: String, required: true, unique: true },
    params: { type: Schema.Types.Mixed, required: true },
    totalReturnPercent: { type: Number, required: true },
    finalCapital: { type: Number, required: true },
    maxDrawdownPercent: { type: Number, required: true },
    winRate: { type: Number, required: true },
    totalTrades: { type: Number, required: true },
    sharpeRatio: { type: Number, required: true },
    equityCurve: { type: [Schema.Types.Mixed], default: [] },
    trades: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

const BacktestResult = model('BacktestResult', backtestResultSchema);

export default BacktestResult;

import mongoose from 'mongoose';
import { BROKERS } from '../config/constants.js';

const PositionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    broker: { type: String, enum: BROKERS, required: true },
    symbol: { type: String, required: true },
    quantity: { type: Number, required: true },
    avgBuyPrice: { type: Number, required: true },
    investedAmount: { type: Number, required: true },
    highestPriceSeen: { type: Number, required: true },
    stopLoss: { type: Number, default: null },
    target: { type: Number, default: null },
    aiDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIDecisionLog', default: null },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

PositionSchema.index({ userId: 1, broker: 1, symbol: 1 }, { unique: true });

export const Position = mongoose.models.Position || mongoose.model('Position', PositionSchema);

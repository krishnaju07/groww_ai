import mongoose from 'mongoose';
import { ACTIONS, BROKERS, TRADE_SOURCES } from '../config/constants.js';

/** One row per filled economic event — a BUY that opened a position, or a SELL that closed one. */
const TradeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    broker: { type: String, enum: BROKERS, required: true },
    mode: { type: String, enum: ['paper', 'live'], required: true },
    symbol: { type: String, required: true },
    action: { type: String, enum: ACTIONS, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    investmentAmount: { type: Number, required: true },
    tradeSource: { type: String, enum: TRADE_SOURCES, default: 'manual' },
    triggerReason: { type: String, default: '' },
    status: { type: String, enum: ['OPEN', 'CLOSED'], required: true },
    pnl: { type: Number, default: 0 },
    pnlPercent: { type: Number, default: 0 },
    aiDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIDecisionLog', default: null },
    brokerOrderId: { type: String, default: null },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TradeSchema.index({ userId: 1, createdAt: -1 });

export const Trade = mongoose.models.Trade || mongoose.model('Trade', TradeSchema);

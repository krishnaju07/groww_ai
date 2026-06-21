import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A single executed paper trade (mirrors the Trade DTO minus `id`).
 * BUY trades open as OPEN; the matching BUY is marked CLOSED with pnl when sold.
 * SELL trades are created CLOSED with realized pnl.
 */
const tradeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    action: { type: String, required: true, enum: ['BUY', 'SELL'] },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    investmentAmount: { type: Number, required: true },
    tradeType: { type: String, required: true, enum: ['manual', 'automatic'] },
    triggerReason: { type: String },
    status: { type: String, required: true, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    mode: { type: String, enum: ['paper', 'live'], default: 'paper' },
    brokerOrderId: { type: String },
    pnl: { type: Number },
    pnlPercent: { type: Number },
    openedAt: { type: Date, required: true, default: Date.now },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ userId: 1, createdAt: -1 });

const Trade = model('Trade', tradeSchema);

export default Trade;

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * An open holding for a user/symbol. Removed entirely on full SELL.
 * Live currentPrice/value/unrealized are derived at read time from a quote.
 */
const positionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    quantity: { type: Number, required: true },
    avgBuyPrice: { type: Number, required: true },
    investedAmount: { type: Number, required: true },
    highestPriceSeen: { type: Number, required: true },
    openedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

positionSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const Position = model('Position', positionSchema);

export default Position;

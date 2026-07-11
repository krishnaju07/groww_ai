import mongoose from 'mongoose';
import { BROKERS, OPTION_TYPES } from '../config/constants.js';

const PositionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    broker: { type: String, enum: BROKERS, required: true },
    symbol: { type: String, required: true },
    // See Order.js for the same segment/option-identity fields — carried onto the
    // position so PositionsTable/positionGuardianJob/squareOffJob can show/close it
    // correctly without a separate Instrument lookup.
    segment: { type: String, enum: ['CASH', 'FNO'], default: 'CASH' },
    underlying: { type: String, default: null },
    strike: { type: Number, default: null },
    expiry: { type: Date, default: null },
    optionType: { type: String, enum: [...OPTION_TYPES, null], default: null },
    lotSize: { type: Number, default: null },
    quantity: { type: Number, required: true },
    avgBuyPrice: { type: Number, required: true },
    investedAmount: { type: Number, required: true },
    highestPriceSeen: { type: Number, required: true },
    stopLoss: { type: Number, default: null },
    target: { type: Number, default: null },
    // Broker-side GTT/OCO safety net (Groww only — see GrowwBroker.placeProtectiveOco).
    // Set once after entry, cleared implicitly when the position itself is deleted (closed).
    smartOrderId: { type: String, default: null },
    smartOrderType: { type: String, default: null },
    aiDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIDecisionLog', default: null },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

PositionSchema.index({ userId: 1, broker: 1, symbol: 1 }, { unique: true });

export const Position = mongoose.models.Position || mongoose.model('Position', PositionSchema);

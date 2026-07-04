import mongoose from 'mongoose';
import { ACTIONS, BROKERS, ORDER_STATUSES, TRADE_SOURCES } from '../config/constants.js';

/** Broker-level order lifecycle — distinct from Trade, which only records a FILLED economic event. */
const OrderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    broker: { type: String, enum: BROKERS, required: true },
    mode: { type: String, enum: ['paper', 'live'], required: true },
    brokerOrderId: { type: String, default: null },
    symbol: { type: String, required: true },
    action: { type: String, enum: ACTIONS, required: true },
    orderType: { type: String, enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
    quantity: { type: Number, required: true },
    price: { type: Number, default: null },
    triggerPrice: { type: Number, default: null },
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING' },
    idempotencyKey: { type: String, required: true, unique: true },
    source: { type: String, enum: TRADE_SOURCES, default: 'manual' },
    confirmedRealMoney: { type: Boolean, default: false },
    rejectReason: { type: String, default: '' },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', default: null },
  },
  { timestamps: true },
);

OrderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

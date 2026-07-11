import mongoose from 'mongoose';
import { ACTIONS, BROKERS, ORDER_STATUSES, TRADE_SOURCES, OPTION_TYPES } from '../config/constants.js';

/** Broker-level order lifecycle — distinct from Trade, which only records a FILLED economic event. */
const OrderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    broker: { type: String, enum: BROKERS, required: true },
    mode: { type: String, enum: ['paper', 'live'], required: true },
    brokerOrderId: { type: String, default: null },
    symbol: { type: String, required: true },
    // 'CASH' (default, equity) or 'FNO' (options) — for FNO, `symbol` is the exact
    // Groww option contract trading_symbol (e.g. 'NIFTY25DEC24500CE'), and the
    // underlying/strike/expiry/optionType/lotSize fields below describe that contract.
    segment: { type: String, enum: ['CASH', 'FNO'], default: 'CASH' },
    underlying: { type: String, default: null },
    strike: { type: Number, default: null },
    expiry: { type: Date, default: null },
    optionType: { type: String, enum: [...OPTION_TYPES, null], default: null },
    lotSize: { type: Number, default: null },
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
    // Every order's "why" — automatic/AI orders get the triggering signal's reason;
    // manual orders get 'manual' or the AI's reason if the user acted on a live "Ask AI"
    // read. aiDecisionId links straight to the full AIDecisionLog (confidence,
    // justification, score breakdown, indicator snapshot) when one exists.
    triggerReason: { type: String, default: '' },
    aiDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIDecisionLog', default: null },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', default: null },
  },
  { timestamps: true },
);

OrderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

import mongoose from 'mongoose';

/**
 * One row per tradable F&O (or cash) contract, synced daily from Groww's public
 * instrument CSV (instrumentSync.js) — the only source of strike/expiry/lot-size
 * truth for this platform (never hardcoded, since NSE revises lot sizes/strikes
 * periodically). `tradingSymbol` is the exact string Groww's order/quote APIs expect.
 */
const InstrumentSchema = new mongoose.Schema(
  {
    exchange: { type: String, required: true },
    tradingSymbol: { type: String, required: true },
    growwSymbol: { type: String, default: '' },
    name: { type: String, default: '' },
    instrumentType: { type: String, enum: ['EQ', 'FUT', 'OPT'], required: true },
    segment: { type: String, enum: ['CASH', 'FNO'], required: true },
    underlyingSymbol: { type: String, default: '' },
    expiryDate: { type: Date, default: null },
    strikePrice: { type: Number, default: null },
    optionType: { type: String, enum: ['CE', 'PE', null], default: null },
    lotSize: { type: Number, default: null },
    tickSize: { type: Number, default: null },
  },
  { timestamps: true },
);

InstrumentSchema.index({ tradingSymbol: 1, segment: 1 }, { unique: true });
InstrumentSchema.index({ underlyingSymbol: 1, segment: 1, expiryDate: 1, strikePrice: 1 });

export const Instrument = mongoose.models.Instrument || mongoose.model('Instrument', InstrumentSchema);

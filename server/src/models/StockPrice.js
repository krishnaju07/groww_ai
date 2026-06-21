import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Latest market snapshot per symbol (best-effort upsert by the market-data layer).
 * Mirrors the StockQuote DTO; one document per canonical symbol.
 */
const stockPriceSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, trim: true, uppercase: true },
    price: { type: Number, required: true },
    change: { type: Number, required: true },
    changePercent: { type: Number, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    previousClose: { type: Number, required: true },
    volume: { type: Number, required: true },
    timestamp: { type: Date, required: true },
  },
  { timestamps: true }
);

const StockPrice = model('StockPrice', stockPriceSchema);

export default StockPrice;

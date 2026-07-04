import mongoose from 'mongoose';

/** Short-lived OHLCV candle cache per symbol, used by indicators/backtest when a provider needs history. */
const StockPriceSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true },
    interval: { type: String, enum: ['1m', '5m', '15m', '1d'], required: true },
    candles: [
      {
        time: { type: Date, required: true },
        open: { type: Number, required: true },
        high: { type: Number, required: true },
        low: { type: Number, required: true },
        close: { type: Number, required: true },
        volume: { type: Number, required: true },
      },
    ],
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

StockPriceSchema.index({ symbol: 1, interval: 1 }, { unique: true });

export const StockPrice = mongoose.models.StockPrice || mongoose.model('StockPrice', StockPriceSchema);

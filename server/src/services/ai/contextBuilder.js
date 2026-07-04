import { marketData } from '../marketData/index.js';
import { rsi, macd, volumeRatio, trend, parabolicSar, supertrend } from '../indicators.js';
import { supportResistance } from './supportResistance.js';
import { getNiftySentiment } from './niftySentimentService.js';
import { getSectorContext } from './sectorContext.js';

/**
 * Assembles everything the AI decision engine (and the quant scorer) needs for
 * one symbol: LTP, RSI/MACD/volume, Parabolic SAR, Supertrend, a short-term (5m),
 * medium-term (15m) AND long-term (30m) trend read, support/resistance,
 * sector-relative strength, and a pre-summarized Nifty sentiment sentence. Three
 * independent timeframes let the scorer/prompt require confluence (all three
 * agreeing) before treating a signal as high-confidence — a single 5m blip
 * shouldn't be enough to trade on.
 * @param {string} symbol
 * @returns {Promise<import('../../types.js').IndicatorSnapshot>}
 */
export async function buildContext(symbol) {
  const [ltp, candles5m, candles15m, candles30m, niftySentiment, sectorContext] = await Promise.all([
    marketData.getLTP(symbol),
    marketData.getCandles(symbol, '5m', 100),
    marketData.getCandles(symbol, '15m', 100),
    marketData.getCandles(symbol, '30m', 100),
    getNiftySentiment(),
    getSectorContext(symbol),
  ]);

  const closes5m = candles5m.map((c) => c.close);
  const closes15m = candles15m.map((c) => c.close);
  const closes30m = candles30m.map((c) => c.close);
  const highs5m = candles5m.map((c) => c.high);
  const lows5m = candles5m.map((c) => c.low);
  const volumes = candles5m.map((c) => c.volume);
  const ohlc5m = { high: highs5m, low: lows5m, close: closes5m };

  return {
    ltp,
    rsi: rsi(closes5m),
    macd: macd(closes5m),
    volumeRatio: volumeRatio(volumes),
    trendShortTerm: trend(closes5m),
    trendMediumTerm: trend(closes15m),
    trendLongTerm: trend(closes30m),
    psar: parabolicSar(ohlc5m),
    supertrend: supertrend(ohlc5m),
    levels: supportResistance(candles5m),
    sector: sectorContext.sector,
    sectorRelativeStrength: sectorContext.relativeStrength,
    niftySentiment: niftySentiment.sentence,
  };
}

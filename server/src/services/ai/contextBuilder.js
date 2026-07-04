import { marketData } from '../marketData/index.js';
import { rsi, macd, volumeRatio, trend } from '../indicators.js';
import { supportResistance } from './supportResistance.js';
import { getNiftySentiment } from './niftySentimentService.js';
import { getSectorContext } from './sectorContext.js';

/**
 * Assembles everything the AI decision engine (and the quant scorer) needs for
 * one symbol: LTP, RSI/MACD/volume, a short-term (5m) AND medium-term (15m)
 * trend read, support/resistance, sector-relative strength, and a
 * pre-summarized Nifty sentiment sentence.
 * @param {string} symbol
 * @returns {Promise<import('../../types.js').IndicatorSnapshot>}
 */
export async function buildContext(symbol) {
  const [ltp, candles5m, candles15m, niftySentiment, sectorContext] = await Promise.all([
    marketData.getLTP(symbol),
    marketData.getCandles(symbol, '5m', 100),
    marketData.getCandles(symbol, '15m', 100),
    getNiftySentiment(),
    getSectorContext(symbol),
  ]);

  const closes5m = candles5m.map((c) => c.close);
  const closes15m = candles15m.map((c) => c.close);
  const volumes = candles5m.map((c) => c.volume);

  return {
    ltp,
    rsi: rsi(closes5m),
    macd: macd(closes5m),
    volumeRatio: volumeRatio(volumes),
    trendShortTerm: trend(closes5m),
    trendMediumTerm: trend(closes15m),
    levels: supportResistance(candles5m),
    sector: sectorContext.sector,
    sectorRelativeStrength: sectorContext.relativeStrength,
    niftySentiment: niftySentiment.sentence,
  };
}

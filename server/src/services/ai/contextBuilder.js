import { marketData } from '../marketData/index.js';
import { rsi, macd, volumeRatio, trend } from '../indicators.js';
import { supportResistance } from './supportResistance.js';
import { getNiftySentiment } from './niftySentimentService.js';

/**
 * Assembles everything the AI decision engine (and the quant scorer) needs for
 * one symbol: LTP, RSI/MACD/volume/trend, support/resistance, and a pre-summarized
 * Nifty sentiment sentence.
 * @param {string} symbol
 * @returns {Promise<import('../../types.js').IndicatorSnapshot>}
 */
export async function buildContext(symbol) {
  const [ltp, candles, niftySentiment] = await Promise.all([
    marketData.getLTP(symbol),
    marketData.getCandles(symbol, '5m', 100),
    getNiftySentiment(),
  ]);

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  return {
    ltp,
    rsi: rsi(closes),
    macd: macd(closes),
    volumeRatio: volumeRatio(volumes),
    trend: trend(closes),
    levels: supportResistance(candles),
    niftySentiment: niftySentiment.sentence,
  };
}

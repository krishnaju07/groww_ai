import { marketData } from '../marketData/index.js';
import { rsi, macd, volumeRatio, trend, parabolicSar, supertrend } from '../indicators.js';
import { supportResistance } from './supportResistance.js';
import { getNiftySentiment } from './niftySentimentService.js';
import { getSectorContext } from './sectorContext.js';
import { getNewsForSymbol } from './newsService.js';
import { getTrackRecord } from './trackRecordService.js';
import { getIntradaySessionContext } from '../../utils/marketHours.js';
import { DEFAULT_USER_ID, STOCK_UNIVERSE } from '../../config/constants.js';

/**
 * Assembles everything the AI decision engine (and the quant scorer) needs for
 * one symbol: LTP, RSI/MACD/volume, Parabolic SAR, Supertrend, a short-term (5m),
 * medium-term (15m) AND long-term (30m) trend read, support/resistance,
 * sector-relative strength, a pre-summarized Nifty sentiment sentence, today's news
 * headlines, and this symbol's own historical AI-decision track record. Three
 * independent timeframes let the scorer/prompt require confluence (all three
 * agreeing) before treating a signal as high-confidence — a single 5m blip
 * shouldn't be enough to trade on.
 * @param {string} symbol @param {string} [userId]
 * @returns {Promise<import('../../types.js').IndicatorSnapshot>}
 */
export async function buildContext(symbol, userId = DEFAULT_USER_ID) {
  const companyName = STOCK_UNIVERSE.find((s) => s.symbol === symbol)?.name ?? symbol;

  const [ltp, candles5m, candles15m, candles30m, niftySentiment, sectorContext, news, trackRecord] = await Promise.all([
    marketData.getLTP(symbol),
    marketData.getCandles(symbol, '5m', 100),
    marketData.getCandles(symbol, '15m', 100),
    marketData.getCandles(symbol, '30m', 100),
    getNiftySentiment(),
    getSectorContext(symbol),
    getNewsForSymbol(symbol, companyName).catch((err) => {
      console.error(`[contextBuilder] news fetch failed for ${symbol}:`, err.message);
      return [];
    }),
    getTrackRecord(userId, symbol).catch((err) => {
      console.error(`[contextBuilder] track record lookup failed for ${symbol}:`, err.message);
      return { totalClosed: 0, winRate: null, avgPnl: null };
    }),
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
    ...getIntradaySessionContext(),
    levels: supportResistance(candles5m),
    sector: sectorContext.sector,
    sectorRelativeStrength: sectorContext.relativeStrength,
    niftySentiment: niftySentiment.sentence,
    news,
    trackRecord,
  };
}

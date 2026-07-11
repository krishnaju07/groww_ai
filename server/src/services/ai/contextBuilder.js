import { marketData } from '../marketData/index.js';
import { rsi, macd, volumeRatio, trend, parabolicSar, supertrend, atr } from '../indicators.js';
import { supportResistance } from './supportResistance.js';
import { getNiftySentiment } from './niftySentimentService.js';
import { getSectorContext } from './sectorContext.js';
import { getNewsForSymbol } from './newsService.js';
import { getTrackRecord, getOptionsTrackRecord } from './trackRecordService.js';
import { getEquityDetails } from '../instruments/instrumentService.js';
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
  // The curated seed list has a hand-picked name; anything else (the wider real
  // equity universe — see instrumentService.searchEquities) is resolved from the
  // synced Instrument record, falling back to the bare symbol if that lookup misses.
  const seedName = STOCK_UNIVERSE.find((s) => s.symbol === symbol)?.name;
  const companyName = seedName ?? (await getEquityDetails([symbol]))[symbol]?.name ?? symbol;

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
    atr: atr(ohlc5m),
    ...getIntradaySessionContext(),
    levels: supportResistance(candles5m),
    sector: sectorContext.sector,
    sectorRelativeStrength: sectorContext.relativeStrength,
    niftySentiment: niftySentiment.sentence,
    news,
    trackRecord,
  };
}

/**
 * Options variant of buildContext(): the directional signal (RSI/MACD/trend/PSAR/
 * Supertrend/support-resistance) is computed on the UNDERLYING INDEX's own candles —
 * that's what actually carries a tradeable technical pattern, unlike an option's premium
 * series, which is dominated by time decay and doesn't candle-pattern the same way.
 * Both the CE and PE contract at the chosen strike are fetched (their own premium +
 * best-effort premiumAtr + direction-specific track record) since the decision is which
 * SIDE to buy — the directional signal alone doesn't determine that until it's scored
 * (see aiSignalService.scoreQuantOptions), so both sides must be available up front.
 * `premiumAtr` defaults to 0 when a contract doesn't have enough own candle history yet —
 * callers must fall back to a flat percent-of-premium, same convention as equity's ATR fallback.
 * @param {{underlying:string, spotSymbol:string, strike:number, expiry:Date, lotSize:number,
 *   ce:{tradingSymbol:string, growwSymbol:string}, pe:{tradingSymbol:string, growwSymbol:string}}} contract
 * @param {string} [userId]
 * @returns {Promise<import('../../types.js').OptionsIndicatorSnapshot>}
 */
export async function buildOptionsContext(contract, userId = DEFAULT_USER_ID) {
  const { underlying, spotSymbol, strike, expiry, lotSize, ce, pe } = contract;

  const [spotCandles5m, spotCandles15m, spotCandles30m, niftySentiment, news, ceSide, peSide] = await Promise.all([
    marketData.getCandles(spotSymbol, '5m', 100),
    marketData.getCandles(spotSymbol, '15m', 100),
    marketData.getCandles(spotSymbol, '30m', 100),
    getNiftySentiment(),
    getNewsForSymbol(underlying, `${underlying} index`).catch((err) => {
      console.error(`[contextBuilder] news fetch failed for ${underlying}:`, err.message);
      return [];
    }),
    buildOptionSide(ce, underlying, 'CE', userId),
    buildOptionSide(pe, underlying, 'PE', userId),
  ]);

  const closes5m = spotCandles5m.map((c) => c.close);
  const closes15m = spotCandles15m.map((c) => c.close);
  const closes30m = spotCandles30m.map((c) => c.close);
  const highs5m = spotCandles5m.map((c) => c.high);
  const lows5m = spotCandles5m.map((c) => c.low);
  const volumes = spotCandles5m.map((c) => c.volume);
  const ohlc5m = { high: highs5m, low: lows5m, close: closes5m };

  return {
    underlying,
    strike,
    expiry,
    lotSize,
    spotLtp: closes5m.at(-1) ?? 0,
    ce: ceSide,
    pe: peSide,
    rsi: rsi(closes5m),
    macd: macd(closes5m),
    volumeRatio: volumeRatio(volumes),
    trendShortTerm: trend(closes5m),
    trendMediumTerm: trend(closes15m),
    trendLongTerm: trend(closes30m),
    psar: parabolicSar(ohlc5m),
    supertrend: supertrend(ohlc5m),
    atr: atr(ohlc5m),
    ...getIntradaySessionContext(),
    levels: supportResistance(spotCandles5m),
    niftySentiment: niftySentiment.sentence,
    news,
  };
}

/**
 * @param {{tradingSymbol:string, growwSymbol:string}} contract
 * @param {string} underlying @param {'CE'|'PE'} optionType @param {string} userId
 * @returns {Promise<{tradingSymbol:string, premium:number, premiumAtr:number, trackRecord:object}>}
 */
async function buildOptionSide(contract, underlying, optionType, userId) {
  const [premium, trackRecord, premiumCandles] = await Promise.all([
    marketData.getLTP(contract.tradingSymbol, 'FNO'),
    getOptionsTrackRecord(userId, underlying, optionType).catch((err) => {
      console.error(`[contextBuilder] options track record lookup failed for ${underlying} ${optionType}:`, err.message);
      return { totalClosed: 0, winRate: null, avgPnl: null };
    }),
    marketData.getCandles(contract.growwSymbol, '5m', 100, 'FNO').catch((err) => {
      console.error(`[contextBuilder] premium candle fetch failed for ${contract.tradingSymbol}, premiumAtr falls back to 0:`, err.message);
      return [];
    }),
  ]);

  const premiumAtr = premiumCandles.length
    ? atr({
        high: premiumCandles.map((c) => c.high),
        low: premiumCandles.map((c) => c.low),
        close: premiumCandles.map((c) => c.close),
      })
    : 0;

  return { tradingSymbol: contract.tradingSymbol, premium, premiumAtr, trackRecord };
}

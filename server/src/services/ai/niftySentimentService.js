import { SMA } from 'technicalindicators';
import { marketData } from '../marketData/index.js';
import { NIFTY_INDEX_SYMBOL } from '../../config/constants.js';
import { round2 } from '../../utils/format.js';

/**
 * Cheap quant heuristic (SMA20-vs-SMA50 trend + day change%), pre-summarized into
 * one sentence so it stays compact in the AI prompt — never sent as a raw data dump.
 * @returns {Promise<{sentence:string, changePercent:number, bias:'BULLISH'|'BEARISH'|'NEUTRAL'}>}
 */
export async function getNiftySentiment() {
  const candles = await marketData.getCandles(NIFTY_INDEX_SYMBOL, '1d', 60);
  if (candles.length < 2) {
    return { sentence: 'Nifty data unavailable, treat market bias as neutral.', changePercent: 0, bias: 'NEUTRAL' };
  }

  const closes = candles.map((c) => c.close);
  const last = closes.at(-1);
  const prev = closes.at(-2);
  const changePercent = round2(((last - prev) / prev) * 100);

  const sma20 = SMA.calculate({ period: 20, values: closes }).at(-1) ?? last;
  const sma50 = SMA.calculate({ period: 50, values: closes }).at(-1) ?? last;

  let bias = 'NEUTRAL';
  if (last > sma20 && sma20 > sma50) bias = 'BULLISH';
  else if (last < sma20 && sma20 < sma50) bias = 'BEARISH';

  const direction = changePercent >= 0 ? 'up' : 'down';
  const sentence = `Nifty ${direction} ${Math.abs(changePercent)}% today, ${
    last > sma20 ? 'above' : 'below'
  } SMA20, ${bias.toLowerCase()} bias.`;

  return { sentence, changePercent, bias };
}

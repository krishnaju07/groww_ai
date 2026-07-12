import { PSAR, ATR } from 'technicalindicators';

const PSAR_STEP = 0.02;
const PSAR_MAX = 0.2;
const SUPERTREND_PERIOD = 10;
const SUPERTREND_MULTIPLIER = 3;

/**
 * Full historical Supertrend line, split into up/down segments for two-color rendering
 * (lightweight-charts has no per-point line color, so an up series + a down series with
 * gaps is the standard technique). Mirrors server/src/services/indicators.js's
 * supertrend() algorithm exactly — same formula, same constants — but keeps every step
 * instead of only the latest value, since the chart needs the whole trailing band.
 * @param {{time:Date|string, high:number, low:number, close:number}[]} candles
 * @returns {{up: {time:number, value:number}[], down: {time:number, value:number}[]}}
 */
export function supertrendSeries(candles) {
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const atrValues = ATR.calculate({ high, low, close, period: SUPERTREND_PERIOD });
  const offset = high.length - atrValues.length;
  const up = [];
  const down = [];
  if (offset < 0 || atrValues.length < 2) return { up, down };

  let trendUp = true;
  let upBand = (high[offset] + low[offset]) / 2 - SUPERTREND_MULTIPLIER * atrValues[0];
  let downBand = (high[offset] + low[offset]) / 2 + SUPERTREND_MULTIPLIER * atrValues[0];

  for (let i = 1; i < atrValues.length; i++) {
    const idx = offset + i;
    const upPrev = upBand;
    const downPrev = downBand;

    const mid = (high[idx] + low[idx]) / 2;
    const candidateUp = mid - SUPERTREND_MULTIPLIER * atrValues[i];
    const candidateDown = mid + SUPERTREND_MULTIPLIER * atrValues[i];

    upBand = close[idx - 1] > upPrev ? Math.max(candidateUp, upPrev) : candidateUp;
    downBand = close[idx - 1] < downPrev ? Math.min(candidateDown, downPrev) : candidateDown;
    trendUp = trendUp ? close[idx] >= upPrev : close[idx] > downPrev;

    const time = Math.floor(new Date(candles[idx].time).getTime() / 1000);
    if (trendUp) up.push({ time, value: upBand });
    else down.push({ time, value: downBand });
  }
  return { up, down };
}

/**
 * Full historical Parabolic SAR — a trailing stop-and-reverse dot per candle. Mirrors
 * server/src/services/indicators.js's parabolicSar() (same library, same params), but
 * returns every step so it can be drawn as dots along the whole chart.
 * @param {{time:Date|string, high:number, low:number}[]} candles
 * @returns {{time:number, value:number}[]}
 */
export function psarSeries(candles) {
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const values = PSAR.calculate({ high, low, step: PSAR_STEP, max: PSAR_MAX });
  const offset = candles.length - values.length;
  if (offset < 0) return [];
  return values.map((value, i) => ({
    time: Math.floor(new Date(candles[offset + i].time).getTime() / 1000),
    value,
  }));
}

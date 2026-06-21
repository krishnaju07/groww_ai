/**
 * Backtest Engine (§9).
 *
 * Long-only, one-position-at-a-time simulation over historical candles.
 * Reuses the EXACT §6 scoring (`scoreFromIndicators`) and the §8 exit rules
 * (stop / take / trailing + AI SELL) so backtests mirror live behaviour.
 */

import { randomUUID } from 'node:crypto';
import { marketData } from './marketData/index.js';
import { scoreFromIndicators } from './aiSignalService.js';
import { sma, rsi, macd, momentum, volumeRatio } from './indicators.js';
import { INDICATORS } from '../config/constants.js';
import BacktestResult from '../models/BacktestResult.js';

/**
 * Round to 2 decimals.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Build a §1 SignalIndicators object from price/volume series up to `i`
 * (inclusive). Mirrors aiSignalService's indicator construction so the
 * shared scorer produces identical results.
 * @param {number[]} closes
 * @param {number[]} volumes
 * @returns {import('../types.js').SignalIndicators}
 */
function indicatorsAt(closes, volumes) {
  const macdRes = macd(closes);
  return {
    rsi: rsi(closes, INDICATORS.rsiPeriod),
    macd: macdRes.histogram,
    momentum: momentum(closes, INDICATORS.momentumWindow),
    volumeRatio: volumeRatio(volumes, INDICATORS.volumeAvgWindow),
    sma20: sma(closes, INDICATORS.sma20),
    sma50: sma(closes, INDICATORS.sma50),
  };
}

/**
 * Sample standard deviation of an array.
 * @param {number[]} values
 * @param {number} mean
 * @returns {number}
 */
function stdDev(values, mean) {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Run a backtest and persist the result.
 * @param {import('../types.js').BacktestParams} params
 * @returns {Promise<import('../types.js').BacktestResult>}
 */
export async function runBacktest(params) {
  const {
    symbol,
    startDate,
    endDate,
    initialCapital,
    perTradeAmount,
    minConfidenceScore,
    stopLossPercent,
    takeProfitPercent,
    trailingStopPercent,
  } = params;

  // Fetch enough history to cover the range (plus warm-up for indicators).
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:59:59Z`);
  const spanDays = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
  // Add generous lookback so day i >= 50 prior candles is reachable in-range.
  const lookbackDays = spanDays + 200;

  const allCandles = await marketData.getHistory(symbol, lookbackDays);

  // Sort oldest -> newest defensively.
  const sorted = [...allCandles].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const closes = sorted.map((c) => c.close);
  const volumes = sorted.map((c) => c.volume);

  // Index range that falls inside [startDate, endDate].
  const inRange = (d) => d >= startDate && d <= endDate;

  // Simulation state.
  let cash = initialCapital;
  let sharesHeld = 0;
  let avgBuyPrice = 0;
  let highestPriceSeen = 0;

  /** @type {import('../types.js').BacktestTrade[]} */
  const trades = [];
  /** @type {import('../types.js').EquityPoint[]} */
  const equityCurve = [];
  /** @type {number[]} */
  const dailyReturns = [];

  let prevEquity = initialCapital;
  let closedTrades = 0;
  let winningTrades = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const candle = sorted[i];
    const close = candle.close;
    const date = candle.date;

    // Only act on candles within the requested window and with enough history.
    const canEvaluate = inRange(date) && i >= 50;

    if (canEvaluate) {
      const ind = indicatorsAt(closes.slice(0, i + 1), volumes.slice(0, i + 1));
      const { signal, confidence } = scoreFromIndicators(ind);

      if (sharesHeld === 0) {
        // Flat: consider entering on a confident BUY.
        if (signal === 'BUY' && confidence >= minConfidenceScore && cash >= perTradeAmount) {
          const qty = Math.floor(perTradeAmount / close);
          if (qty >= 1) {
            const cost = qty * close;
            cash = round2(cash - cost);
            sharesHeld = qty;
            avgBuyPrice = close;
            highestPriceSeen = close;
            trades.push({
              symbol,
              action: 'BUY',
              date,
              price: round2(close),
              quantity: qty,
              reason: `AI BUY signal ${confidence}% confidence`,
            });
          }
        }
      } else {
        // Holding: update peak, then evaluate exit rules (§8 order).
        highestPriceSeen = Math.max(highestPriceSeen, close);
        const unrealizedPct = (close / avgBuyPrice - 1) * 100;

        let exitReason = null;
        if (unrealizedPct <= -stopLossPercent) {
          exitReason = `Stop loss hit at ${round2(unrealizedPct)}%`;
        } else if (unrealizedPct >= takeProfitPercent) {
          exitReason = `Take profit hit at ${round2(unrealizedPct)}%`;
        } else if (
          trailingStopPercent > 0 &&
          close <= highestPriceSeen * (1 - trailingStopPercent / 100)
        ) {
          exitReason = `Trailing stop from peak ${round2(highestPriceSeen)}`;
        } else if (signal === 'SELL' && confidence >= 70) {
          exitReason = `AI SELL signal ${confidence}%`;
        }

        if (exitReason) {
          const proceeds = sharesHeld * close;
          const pnl = (close - avgBuyPrice) * sharesHeld;
          const pnlPercent = (close / avgBuyPrice - 1) * 100;
          cash = round2(cash + proceeds);
          trades.push({
            symbol,
            action: 'SELL',
            date,
            price: round2(close),
            quantity: sharesHeld,
            pnl: round2(pnl),
            pnlPercent: round2(pnlPercent),
            reason: exitReason,
          });
          closedTrades += 1;
          if (pnl > 0) winningTrades += 1;
          sharesHeld = 0;
          avgBuyPrice = 0;
          highestPriceSeen = 0;
        }
      }
    }

    // Daily equity point (only for in-range days).
    if (inRange(date)) {
      const equity = round2(cash + sharesHeld * close);
      // Record the daily return only from the 2nd in-range day onward. The day-0
      // return is ~0 (entering converts cash to shares at the same close), and
      // including it would bias the Sharpe ratio downward.
      if (equityCurve.length > 0 && prevEquity > 0) {
        dailyReturns.push((equity - prevEquity) / prevEquity);
      }
      equityCurve.push({ date: new Date(`${date}T00:00:00Z`).toISOString(), value: equity });
      prevEquity = equity;
    }
  }

  // Final liquidation value (mark-to-market on last in-range close).
  const lastInRange = sorted.filter((c) => inRange(c.date));
  const lastClose = lastInRange.length ? lastInRange[lastInRange.length - 1].close : 0;
  const finalCapital = round2(cash + sharesHeld * lastClose);

  // Metrics.
  const totalReturnPercent =
    initialCapital > 0 ? round2((finalCapital / initialCapital - 1) * 100) : 0;

  // Max drawdown (peak-to-trough), anchored to starting capital so it is robust
  // even if a position is somehow already held entering the window.
  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value;
    if (peak > 0) {
      const dd = (peak - point.value) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }
  const maxDrawdownPercent = round2(maxDrawdown * 100);

  const winRate = closedTrades > 0 ? round2((winningTrades / closedTrades) * 100) : 0;

  // Sharpe ratio annualised (sqrt(252)); std==0 -> 0.
  let sharpeRatio = 0;
  if (dailyReturns.length > 1) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const sd = stdDev(dailyReturns, mean);
    sharpeRatio = sd === 0 ? 0 : round2((mean / sd) * Math.sqrt(252));
  }

  /** @type {import('../types.js').BacktestResult} */
  const result = {
    id: randomUUID(),
    params,
    totalReturnPercent,
    finalCapital,
    maxDrawdownPercent,
    winRate,
    totalTrades: closedTrades,
    sharpeRatio,
    equityCurve,
    trades,
    createdAt: new Date().toISOString(),
  };

  // Persist so GET /api/backtest/results/:id works.
  await BacktestResult.create({
    resultId: result.id,
    id: result.id,
    params: result.params,
    totalReturnPercent: result.totalReturnPercent,
    finalCapital: result.finalCapital,
    maxDrawdownPercent: result.maxDrawdownPercent,
    winRate: result.winRate,
    totalTrades: result.totalTrades,
    sharpeRatio: result.sharpeRatio,
    equityCurve: result.equityCurve,
    trades: result.trades,
    createdAt: result.createdAt,
  });

  return result;
}

export default { runBacktest };

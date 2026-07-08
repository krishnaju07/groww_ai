import { GrowwProvider } from '../marketData/GrowwProvider.js';
import { rsi, macd, volumeRatio, trend, parabolicSar, supertrend } from '../indicators.js';
import { supportResistance } from '../ai/supportResistance.js';
import { scoreQuant } from '../ai/aiSignalService.js';
import { getIntradaySessionContextAt } from '../../utils/marketHours.js';
import { round2, applyPercent, percentOf } from '../../utils/format.js';
import { UserSettings } from '../../models/UserSettings.js';
import { BacktestResult } from '../../models/BacktestResult.js';
import { DEFAULT_USER_ID, DEFAULT_STARTING_CAPITAL } from '../../config/constants.js';

const LOOKBACK_CANDLES = 100; // rolling indicator window — mirrors contextBuilder's live fetch size
const WARMUP_CANDLES = 30; // minimum 5m history the engine wants before it'll consider a signal
const MAX_EQUITY_POINTS = 500; // downsample the stored/charted equity curve

/**
 * Replays the same deterministic quant scorer used live (`aiSignalService.scoreQuant`) over
 * real historical candles pulled straight from Groww — no LLM calls (would be far too slow/
 * costly to run per-candle over months of history) and no mock/synthetic data, consistent with
 * the live-trading data-integrity rule. One position at a time, long-only (mirrors how the real
 * auto-trading engine treats SELL as an exit signal, never a fresh short entry).
 * @param {string} userId
 * @param {{symbol:string, interval?:'5m'|'15m'|'30m', from:Date, to:Date, startingCapital?:number, amountPerTrade?:number, minConfidence?:number, stopLossPercent?:number, targetPercent?:number, trailingEnabled?:boolean, trailingPercent?:number}} input
 * @returns {Promise<import('../../models/BacktestResult.js').BacktestResult>}
 */
export async function runBacktest(userId = DEFAULT_USER_ID, input) {
  const { symbol, from, to } = input;
  const symbolUpper = symbol.toUpperCase();
  if (!(to > from)) {
    const e = new Error('"to" must be after "from".');
    e.status = 400;
    e.code = 'INVALID_RANGE';
    throw e;
  }

  const settings = await UserSettings.findOne({ userId }).lean();
  const cfg = {
    startingCapital: input.startingCapital ?? DEFAULT_STARTING_CAPITAL,
    amountPerTrade: input.amountPerTrade ?? settings?.autoInvest?.amountPerTrade ?? 5000,
    minConfidence: input.minConfidence ?? settings?.autoInvest?.minConfidence ?? 75,
    stopLossPercent: input.stopLossPercent ?? settings?.autoExit?.stopLossPercent ?? 2,
    targetPercent: input.targetPercent ?? settings?.autoExit?.targetPercent ?? 4,
    trailingEnabled: input.trailingEnabled ?? settings?.autoExit?.trailingEnabled ?? false,
    trailingPercent: input.trailingPercent ?? settings?.autoExit?.trailingPercent ?? 1.5,
  };

  // Extra lookback before `from` so RSI/MACD/trend/Supertrend aren't reading as neutral
  // right at the start of the simulated window — a flat 3x multiplier on 15m/30m keeps
  // this simple and errs generous rather than risk running the strategy on thin history.
  const fetchFrom5m = new Date(from.getTime() - WARMUP_CANDLES * 5 * 60 * 1000);
  const fetchFrom15m = new Date(from.getTime() - WARMUP_CANDLES * 3 * 15 * 60 * 1000);
  const fetchFrom30m = new Date(from.getTime() - WARMUP_CANDLES * 3 * 30 * 60 * 1000);

  const [candles5m, candles15m, candles30m] = await Promise.all([
    GrowwProvider.getCandlesRange(symbolUpper, '5m', fetchFrom5m, to),
    GrowwProvider.getCandlesRange(symbolUpper, '15m', fetchFrom15m, to),
    GrowwProvider.getCandlesRange(symbolUpper, '30m', fetchFrom30m, to),
  ]);

  if (!candles5m.length) {
    const e = new Error(`Groww returned no candles for ${symbolUpper} in that range.`);
    e.status = 422;
    e.code = 'NO_HISTORICAL_DATA';
    throw e;
  }

  const startIndex = candles5m.findIndex((c) => c.time >= from);
  const simStart = startIndex === -1 ? candles5m.length : startIndex;
  if (simStart < WARMUP_CANDLES) {
    console.warn(
      `[backtestEngine] only ${simStart} warmup 5m candles before 'from' for ${symbolUpper} (wanted ${WARMUP_CANDLES}) — early signals may read more neutral than usual`,
    );
  }

  // 15m/30m candle arrays are ascending by time; these cursors advance monotonically as
  // the 5m loop progresses so each timeframe is only scanned once total, not re-filtered
  // from scratch every 5m step.
  const cursor15 = { i: -1 };
  const cursor30 = { i: -1 };
  function windowUpTo(candles, cursor, at) {
    while (cursor.i + 1 < candles.length && candles[cursor.i + 1].time <= at) cursor.i++;
    const end = cursor.i + 1;
    return candles.slice(Math.max(0, end - LOOKBACK_CANDLES), end);
  }

  let capital = cfg.startingCapital;
  let position = null; // {entryPrice, entryTime, quantity, stopLoss, target, highestPriceSeen}
  const trades = [];
  const equityCurve = [];
  let peakEquity = cfg.startingCapital;
  let maxDrawdownPercent = 0;

  function closePosition(exitPrice, exitTime, exitReason) {
    const pnl = round2((exitPrice - position.entryPrice) * position.quantity);
    capital = round2(capital + exitPrice * position.quantity);
    trades.push({
      symbol: symbolUpper,
      action: 'SELL',
      quantity: position.quantity,
      price: exitPrice,
      pnl,
      time: exitTime,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitReason,
    });
    position = null;
  }

  for (let i = Math.max(simStart, 0); i < candles5m.length; i++) {
    const candle = candles5m[i];
    const window5m = candles5m.slice(Math.max(0, i - LOOKBACK_CANDLES + 1), i + 1);
    const window15m = windowUpTo(candles15m, cursor15, candle.time);
    const window30m = windowUpTo(candles30m, cursor30, candle.time);
    if (window15m.length < 2 || window30m.length < 2) continue; // not enough multi-timeframe history yet

    const closes5m = window5m.map((c) => c.close);
    const closes15m = window15m.map((c) => c.close);
    const closes30m = window30m.map((c) => c.close);
    const ohlc5m = { high: window5m.map((c) => c.high), low: window5m.map((c) => c.low), close: closes5m };

    const snapshot = {
      ltp: candle.close,
      rsi: rsi(closes5m),
      macd: macd(closes5m),
      volumeRatio: volumeRatio(window5m.map((c) => c.volume)),
      trendShortTerm: trend(closes5m),
      trendMediumTerm: trend(closes15m),
      trendLongTerm: trend(closes30m),
      psar: parabolicSar(ohlc5m),
      supertrend: supertrend(ohlc5m),
      ...getIntradaySessionContextAt(candle.time),
      levels: supportResistance(window5m),
      // Sector/Nifty context is live-fetch-only (no historical equivalent exists yet) —
      // neutral-stubbed rather than faked, so they simply contribute 0 to the quant score
      // instead of silently feeding in today's live sentiment for a past date.
      sector: '',
      sectorRelativeStrength: 0,
      niftySentiment: '',
    };

    const decision = scoreQuant(symbolUpper, snapshot, cfg.amountPerTrade);

    if (position) {
      if (candle.high > position.highestPriceSeen) position.highestPriceSeen = candle.high;
      if (cfg.trailingEnabled) {
        const trailingStop = round2(position.highestPriceSeen * (1 - cfg.trailingPercent / 100));
        position.stopLoss = Math.max(position.stopLoss, trailingStop);
      }

      if (snapshot.sessionPhase === 'after-square-off') {
        closePosition(candle.close, candle.time, 'Square-off (end of session)');
      } else if (candle.low <= position.stopLoss) {
        closePosition(position.stopLoss, candle.time, `Stop-loss hit (₹${position.stopLoss})`);
      } else if (candle.high >= position.target) {
        closePosition(position.target, candle.time, `Target hit (₹${position.target})`);
      } else if (decision.action === 'SELL' && decision.confidence >= cfg.minConfidence) {
        closePosition(candle.close, candle.time, 'AI SELL signal');
      }
    } else if (
      decision.action === 'BUY' &&
      decision.confidence >= cfg.minConfidence &&
      snapshot.sessionPhase !== 'after-square-off' &&
      snapshot.sessionPhase !== 'closing'
    ) {
      const affordableQty = Math.floor(capital / candle.close);
      const quantity = Math.min(decision.quantity, affordableQty);
      if (quantity >= 1) {
        capital = round2(capital - candle.close * quantity);
        position = {
          entryPrice: candle.close,
          entryTime: candle.time,
          quantity,
          stopLoss: applyPercent(candle.close, -cfg.stopLossPercent),
          target: applyPercent(candle.close, cfg.targetPercent),
          highestPriceSeen: candle.close,
        };
      }
    }

    const markToMarket = position ? round2(position.quantity * candle.close) : 0;
    const equity = round2(capital + markToMarket);
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity ? round2(((peakEquity - equity) / peakEquity) * 100) : 0;
    if (drawdown > maxDrawdownPercent) maxDrawdownPercent = drawdown;
    equityCurve.push({ time: candle.time, equity });
  }

  if (position) {
    const last = candles5m.at(-1);
    closePosition(last.close, last.time, 'End of backtest range');
    const equity = round2(capital);
    if (equity > peakEquity) peakEquity = equity;
    equityCurve.push({ time: last.time, equity });
  }

  const winCount = trades.filter((t) => t.pnl > 0).length;
  const lossCount = trades.filter((t) => t.pnl <= 0).length;
  const totalPnl = round2(trades.reduce((s, t) => s + t.pnl, 0));
  const endingCapital = round2(cfg.startingCapital + totalPnl);

  return BacktestResult.create({
    userId,
    symbol: symbolUpper,
    from,
    to,
    startingCapital: cfg.startingCapital,
    endingCapital,
    totalTrades: trades.length,
    winCount,
    lossCount,
    winRate: trades.length ? round2((winCount / trades.length) * 100) : 0,
    totalPnl,
    totalPnlPercent: percentOf(totalPnl, cfg.startingCapital),
    maxDrawdownPercent,
    equityCurve: downsample(equityCurve, MAX_EQUITY_POINTS),
    trades,
  });
}

/** @param {{time:Date, equity:number}[]} points @param {number} maxPoints @returns {{time:Date, equity:number}[]} */
function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]);
  if (out.at(-1) !== points.at(-1)) out.push(points.at(-1));
  return out;
}

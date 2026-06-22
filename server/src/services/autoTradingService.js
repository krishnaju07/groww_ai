/**
 * Auto-Trading Engine (§8).
 *
 * Runs a single auto-trading cycle for a user:
 *  - AutoInvest: opens BUY positions for high-confidence AI BUY signals.
 *  - AutoExit:   evaluates stop-loss / take-profit / trailing-stop / AI-exit
 *                rules for every open position and SELLs on the first hit.
 *
 * Invoked by the node-cron job in `jobs/autoTradingJob.js`.
 */

import { env } from '../config/env.js';
import { STOCK_UNIVERSE, AI_LIVE } from '../config/constants.js';
import { isMarketOpen } from '../utils/marketHours.js';
import { executeTrade } from './tradeService.js';
import { getTopSignals } from './aiSignalService.js';
import { getEnsembleSignal } from './ai/ensembleSignalService.js';
import { marketData } from './marketData/index.js';
import { effectiveMode, growwBroker } from './brokers/index.js';
import User from '../models/User.js';
import UserSettings from '../models/UserSettings.js';
import Position from '../models/Position.js';

/**
 * Whether a verdict has explicit Claude agreement on a direction. When
 * AI_LIVE.requireModelAgreement is on, a real order also requires the Claude
 * model to be present and to vote the same way (so live trades never fire on the
 * quant-only fallback).
 * @param {import('../types.js').AISignal} ensemble
 * @param {import('../types.js').SignalType} direction
 * @returns {boolean}
 */
function claudeAgrees(ensemble, direction) {
  return (ensemble.models || []).some((m) => m.name === 'Claude' && m.signal === direction);
}

/**
 * AI confirmation for a LIVE order in a given direction. Uses the full ensemble
 * (Quant + Claude). Never throws — on any failure it returns not-confirmed so the
 * real order is skipped.
 * @param {string} symbol
 * @param {import('../types.js').SignalType} direction  'BUY' | 'SELL'
 * @param {number} minConfidence
 * @returns {Promise<{ ok: boolean, confidence: number }>}
 */
async function aiConfirmsLive(symbol, direction, minConfidence) {
  try {
    const ensemble = await getEnsembleSignal(symbol);
    const agree = !AI_LIVE.requireModelAgreement || claudeAgrees(ensemble, direction);
    const ok = ensemble.signal === direction && agree && ensemble.confidence >= minConfidence;
    if (!ok) {
      console.log(
        `[autoTrading] live ${direction} ${symbol} not confirmed by AI (ensemble ${ensemble.signal} ${ensemble.confidence}%, claudeAgrees=${claudeAgrees(ensemble, direction)})`,
      );
    }
    return { ok, confidence: ensemble.confidence };
  } catch (err) {
    console.warn(`[autoTrading] AI live ${direction} confirm ${symbol} failed: ${err.message}; skipping`);
    return { ok: false, confidence: 0 };
  }
}

/**
 * Canonical symbols currently held on the REAL Groww account (live mode), mapped
 * from Groww trading symbols back to our universe. Empty set on any failure.
 * @returns {Promise<Set<string>>}
 */
async function liveHeldSymbols() {
  try {
    const holdings = await growwBroker.getHoldings();
    const set = new Set();
    for (const h of holdings) {
      const ts = String(h.trading_symbol || h.symbol || '').toUpperCase();
      const u = STOCK_UNIVERSE.find((x) => x.gtsym.toUpperCase() === ts || x.symbol === ts);
      if (u && Number(h.quantity) > 0) set.add(u.symbol);
    }
    return set;
  } catch (err) {
    console.warn(`[autoTrading] live holdings unavailable: ${err.message}`);
    return new Set();
  }
}

/**
 * Inclusive random integer in [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Clamp a value into [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to 2 decimals.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * AutoInvest pass: open BUY positions for qualifying AI BUY signals.
 * @param {import('mongoose').Document} user
 * @param {import('mongoose').Document} settings
 * @returns {Promise<number>} number of buys executed
 */
async function runAutoInvest(user, settings) {
  if (!settings.autoInvest?.enabled) return 0;

  const mode = effectiveMode(settings);
  const minConfidence = settings.autoInvest.minConfidenceScore;
  const minInvestment = settings.minInvestment;
  const maxInvestment = settings.maxInvestment;

  // Cheap Quant screen first (non-HOLD first, then confidence desc). In live mode
  // each candidate is then re-confirmed by the full ensemble (Quant + Claude).
  const signals = await getTopSignals(Infinity);
  const buySignals = signals
    .filter((s) => s.signal === 'BUY' && s.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);

  // Symbols already held — skip. Live mode reads REAL Groww holdings; paper reads
  // the paper Position collection.
  const heldSymbols =
    mode === 'live'
      ? await liveHeldSymbols()
      : new Set((await Position.find({ userId: user._id }).lean()).map((p) => p.symbol));

  let buysExecuted = 0;

  // Paper-only cash reserve so a single cycle never drains the paper account (§8).
  // (Live funds live on the Groww account; Groww enforces them.)
  const reserve = round2(user.cashBalance * 0.1);

  for (const sig of buySignals) {
    if (heldSymbols.has(sig.symbol)) continue; // already invested

    // Random whole-rupee amount in the configured band, STRICTLY clamped.
    const raw = randomInt(minInvestment, maxInvestment);
    let amount = clamp(raw, minInvestment, maxInvestment);
    if (amount !== raw) {
      // Should never happen — randomInt already bounded; assert via log.
      console.warn(
        `[autoTrading] clamp adjusted amount ${raw} -> ${amount} for ${sig.symbol} (band ${minInvestment}-${maxInvestment})`
      );
    }

    let triggerReason = `AI BUY signal ${sig.confidence}% confidence`;

    if (mode === 'live') {
      // REAL money: require ensemble (Quant + Claude) confirmation, cap blast
      // radius, and limit how many new positions one cycle may open.
      if (buysExecuted >= AI_LIVE.maxBuysPerCycle) break;

      const confirm = await aiConfirmsLive(sig.symbol, 'BUY', minConfidence);
      if (!confirm.ok) continue;

      amount = Math.min(amount, env.LIVE_MAX_ORDER_VALUE);
      triggerReason = `AI ensemble BUY ${confirm.confidence}% (Quant + Claude agree)`;
    } else {
      // Paper: stop opening new buys once the next buy would breach the cash
      // reserve, so we never dump all available cash in a single cycle (§8).
      if (user.cashBalance - amount < reserve) {
        console.warn(
          `[autoTrading] cash buffer reached (cash ${round2(user.cashBalance)}, reserve ${reserve}); stopping new buys this cycle`
        );
        break;
      }
    }

    try {
      await executeTrade({
        userId: String(user._id),
        symbol: sig.symbol,
        action: 'BUY',
        investmentAmount: amount,
        tradeType: 'automatic',
        triggerReason,
      });

      // Reflect paper cash spent locally so subsequent buys see updated funds.
      if (mode !== 'live') user.cashBalance = round2(user.cashBalance - amount);
      heldSymbols.add(sig.symbol);
      settings.autoInvest.lastExecutedAt = new Date();
      buysExecuted += 1;
    } catch (err) {
      console.warn(`[autoTrading] BUY ${sig.symbol} failed: ${err.message}`);
    }
  }

  if (settings.isModified && settings.isModified('autoInvest')) {
    await settings.save();
  }

  return buysExecuted;
}

/**
 * AutoExit pass: evaluate exit rules per open position; SELL on first hit.
 * Always persists `highestPriceSeen` even when not exiting.
 * @param {import('mongoose').Document} user
 * @param {import('mongoose').Document} settings
 * @returns {Promise<number>} number of sells executed
 */
async function runAutoExit(user, settings) {
  if (!settings.autoExit?.enabled) return 0;

  // SAFETY: auto-exit operates on PAPER positions. In live mode there are no
  // paper positions, and acting on a leftover paper position could SELL a REAL
  // holding by mistake. Live exits are intentionally NOT automated here — manage
  // real exits manually or via Groww's native GTT/OCO orders (v2 roadmap).
  if (effectiveMode(settings) === 'live') {
    console.warn('[autoTrading] live mode: auto-exit is not automated (use manual exit or Groww GTT/OCO)');
    return 0;
  }

  const { stopLossPercent, takeProfitPercent, trailingStopPercent, useAiExitSignal } =
    settings.autoExit;

  const positions = await Position.find({ userId: user._id });
  let sellsExecuted = 0;

  // Cache the universe signals once when AI-exit is enabled.
  let aiSignalsBySymbol = null;
  if (useAiExitSignal) {
    try {
      const sigs = await getTopSignals(Infinity);
      aiSignalsBySymbol = new Map(sigs.map((s) => [s.symbol, s]));
    } catch (err) {
      console.warn(`[autoTrading] AI exit signals unavailable: ${err.message}`);
      aiSignalsBySymbol = new Map();
    }
  }

  for (const pos of positions) {
    let quote;
    try {
      quote = await marketData.getQuote(pos.symbol);
    } catch (err) {
      console.warn(`[autoTrading] quote ${pos.symbol} failed: ${err.message}`);
      continue;
    }

    const currentPrice = quote.price;

    // Update highest price seen (persist regardless of exit decision).
    const newHigh = Math.max(pos.highestPriceSeen ?? pos.avgBuyPrice, currentPrice);
    const highChanged = newHigh !== pos.highestPriceSeen;
    pos.highestPriceSeen = newHigh;

    const unrealizedPct = (currentPrice / pos.avgBuyPrice - 1) * 100;

    let triggerReason = null;

    // 1. Stop loss
    if (unrealizedPct <= -stopLossPercent) {
      triggerReason = `Stop loss hit at ${round2(unrealizedPct)}%`;
    }
    // 2. Take profit
    else if (unrealizedPct >= takeProfitPercent) {
      triggerReason = `Take profit hit at ${round2(unrealizedPct)}%`;
    }
    // 3. Trailing stop
    else if (
      trailingStopPercent > 0 &&
      currentPrice <= pos.highestPriceSeen * (1 - trailingStopPercent / 100)
    ) {
      triggerReason = `Trailing stop from peak ${round2(pos.highestPriceSeen)}`;
    }
    // 4. AI exit
    else if (useAiExitSignal) {
      const sig = aiSignalsBySymbol?.get(pos.symbol);
      if (sig && sig.signal === 'SELL' && sig.confidence >= 70) {
        triggerReason = `AI SELL signal ${sig.confidence}%`;
      }
    }

    if (triggerReason) {
      try {
        await executeTrade({
          userId: String(user._id),
          symbol: pos.symbol,
          action: 'SELL',
          investmentAmount: 0,
          tradeType: 'automatic',
          triggerReason,
        });
        sellsExecuted += 1;
        // Position removed by executeTrade; nothing more to persist for it.
        continue;
      } catch (err) {
        console.warn(`[autoTrading] SELL ${pos.symbol} failed: ${err.message}`);
      }
    }

    // Not exited (or exit failed) — persist updated highestPriceSeen.
    if (highChanged) {
      try {
        await pos.save();
      } catch (err) {
        console.warn(`[autoTrading] persist highestPriceSeen ${pos.symbol} failed: ${err.message}`);
      }
    }
  }

  return sellsExecuted;
}

/**
 * Run one full auto-trading cycle (AutoInvest then AutoExit) for a user.
 * No-ops when auto-trading is disabled or the market is closed (unless
 * `IGNORE_MARKET_HOURS`). Never throws — logs a one-line summary per cycle.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function runAutoTradingCycle(userId) {
  try {
    if (!env.AUTO_TRADING_ENABLED) return;
    if (!env.IGNORE_MARKET_HOURS && !isMarketOpen()) return;

    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[autoTrading] user ${userId} not found; skipping cycle`);
      return;
    }

    const settings = await UserSettings.findOne({ userId });
    if (!settings) {
      console.warn(`[autoTrading] settings for ${userId} not found; skipping cycle`);
      return;
    }

    // SAFETY: never let the cron place REAL orders. In live mode the whole cycle
    // is skipped unless ENABLE_LIVE_AUTO_TRADING is explicitly turned on.
    if (effectiveMode(settings) === 'live' && env.ENABLE_LIVE_AUTO_TRADING !== true) {
      console.warn('[autoTrading] live mode active — auto-trading skipped (set ENABLE_LIVE_AUTO_TRADING=true to allow)');
      return;
    }

    const buys = await runAutoInvest(user, settings);
    const sells = await runAutoExit(user, settings);

    console.log(`[autoTrading] cycle done: ${buys} buy(s), ${sells} sell(s)`);
  } catch (err) {
    console.error(`[autoTrading] cycle error: ${err.message}`);
  }
}

export default { runAutoTradingCycle };

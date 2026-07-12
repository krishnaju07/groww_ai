import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { decide, decideOptions } from '../services/ai/decisionEngine.js';
import { AIDecisionLog } from '../models/AIDecisionLog.js';
import { Trade } from '../models/Trade.js';
import { getAllSignals } from '../services/ai/signalCache.js';
import { getMarketRegime } from '../services/ai/regimeService.js';
import { OPTION_UNDERLYINGS } from '../config/constants.js';
import { getEquityDetails } from '../services/instruments/instrumentService.js';
import { round2 } from '../utils/format.js';
import { AutoTradeActivity } from '../models/AutoTradeActivity.js';

export const aiRoutes = Router();

aiRoutes.post(
  '/decide/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    // Validated against the real synced equity universe (instrumentService), not the
    // old fixed STOCK_UNIVERSE — a user can now "Ask AI" on any real NSE stock they've
    // found via search, not just the 12 curated defaults.
    const details = await getEquityDetails([symbol]);
    if (!details[symbol]) {
      const e = new Error(`Unknown symbol: ${symbol}`);
      e.code = 'UNKNOWN_SYMBOL';
      e.status = 400;
      throw e;
    }
    const decision = await decide(req.userId, symbol);
    res.json({ success: true, data: decision });
  }),
);

aiRoutes.post(
  '/decide-options/:underlying',
  asyncHandler(async (req, res) => {
    const underlying = req.params.underlying.toUpperCase();
    if (!OPTION_UNDERLYINGS.some((u) => u.symbol === underlying)) {
      const e = new Error(`Unknown option underlying: ${underlying}`);
      e.code = 'UNKNOWN_SYMBOL';
      e.status = 400;
      throw e;
    }
    const decision = await decideOptions(req.userId, underlying);
    res.json({ success: true, data: decision });
  }),
);

aiRoutes.get(
  '/decisions',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const filter = { userId: req.userId };
    if (req.query.symbol) filter.symbol = String(req.query.symbol).toUpperCase();
    // Options: an option's own tradingSymbol changes every expiry rollover, so filtering
    // by `underlying` (e.g. NIFTY) instead is what actually finds decision history for
    // "the chart currently on screen" (used for chart decision markers).
    if (req.query.underlying) filter.underlying = String(req.query.underlying).toUpperCase();
    if (req.query.action) filter.action = req.query.action;
    const data = await AIDecisionLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, data });
  }),
);

/** Latest AI signal per symbol, from the background scan (aiScanJob) — powers Dashboard top picks, watchlist badges, and Portfolio exit hints. */
aiRoutes.get(
  '/signals',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: getAllSignals() });
  }),
);

/** Current broad-market (NIFTY) regime classification — powers the dashboard "market regime" indicator and gates auto-entries. */
aiRoutes.get(
  '/regime',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getMarketRegime() });
  }),
);

/** Win-rate aggregate across every AI/ensemble-triggered trade that has since closed. */
aiRoutes.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const closedAiTrades = await Trade.find({ userId: req.userId, aiDecisionId: { $ne: null }, status: 'CLOSED' }).lean();
    const totalClosed = closedAiTrades.length;
    const winCount = closedAiTrades.filter((t) => (t.pnl || 0) > 0).length;
    const totalPnl = closedAiTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    res.json({
      success: true,
      data: {
        totalClosed,
        winCount,
        winRate: totalClosed ? round2((winCount / totalClosed) * 100) : 0,
        avgPnl: totalClosed ? round2(totalPnl / totalClosed) : 0,
      },
    });
  }),
);

/**
 * Recent auto-trading tick activity — every skip/veto/order attempt the 30s auto-trader
 * has made, newest first. Previously this only ever hit the server console (autoTradingJob.js);
 * this is what makes "why didn't it trade X" / "did the learned-edge gate fire" visible
 * without watching the terminal at the exact moment it happens.
 */
aiRoutes.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const data = await AutoTradeActivity.find({ userId: req.userId }).sort({ tickAt: -1 }).limit(limit).lean();
    res.json({ success: true, data });
  }),
);

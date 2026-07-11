import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { decide, decideOptions } from '../services/ai/decisionEngine.js';
import { AIDecisionLog } from '../models/AIDecisionLog.js';
import { Trade } from '../models/Trade.js';
import { getAllSignals } from '../services/ai/signalCache.js';
import { OPTION_UNDERLYINGS } from '../config/constants.js';
import { getEquityDetails } from '../services/instruments/instrumentService.js';
import { round2 } from '../utils/format.js';

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

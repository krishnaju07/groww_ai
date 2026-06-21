import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getPortfolio, getEquityCurve } from '../services/portfolioService.js';
import { getTopSignals } from '../services/aiSignalService.js';
import { mapTradeDoc } from '../services/tradeService.js';
import Trade from '../models/Trade.js';
import { loadSettingsDoc } from './settings.routes.js';

const router = Router();

/**
 * Count the active auto-exit rules for the dashboard badge.
 * @param {*} autoExit  settings.autoExit sub-document
 * @returns {number}
 */
function countActiveExitRules(autoExit) {
  if (!autoExit || !autoExit.enabled) return 0;
  let rules = 2; // stop loss + take profit are always evaluated when enabled
  if ((autoExit.trailingStopPercent || 0) > 0) rules += 1;
  if (autoExit.useAiExitSignal) rules += 1;
  return rules;
}

/**
 * GET /api/dashboard — aggregated dashboard payload.
 * @returns {import('../types.js').DashboardData} data
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId;

    const [portfolio, equityCurve, topSignals, recentDocs, lastAutoDoc, settings] =
      await Promise.all([
        getPortfolio(userId),
        getEquityCurve(userId, 30),
        getTopSignals(3),
        Trade.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
        Trade.find({ userId, tradeType: 'automatic' })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean(),
        loadSettingsDoc(userId),
      ]);

    const recentTrades = recentDocs.map((d) => mapTradeDoc(d));

    const autoInvest = { enabled: Boolean(settings.autoInvest && settings.autoInvest.enabled) };
    const lastAuto = lastAutoDoc[0];
    if (lastAuto) {
      autoInvest.lastTrade = {
        symbol: lastAuto.symbol,
        investmentAmount: lastAuto.investmentAmount,
        at: (lastAuto.openedAt
          ? new Date(lastAuto.openedAt)
          : new Date(lastAuto.createdAt)
        ).toISOString(),
      };
    }

    const autoExit = {
      enabled: Boolean(settings.autoExit && settings.autoExit.enabled),
      activeRules: countActiveExitRules(settings.autoExit),
    };

    const data = {
      summary: portfolio.summary,
      equityCurve,
      topSignals,
      recentTrades,
      autoInvest,
      autoExit,
    };
    res.json({ success: true, data });
  }),
);

export default router;

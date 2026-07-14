/**
 * Reports + Learning Engine — analytics over closed trades and their AI decision context.
 * `getPeriodReport` powers the daily/weekly/monthly Reports view; `getLearningInsights`
 * is the vision's "learn from every outcome" layer: it buckets closed AI-triggered trades
 * by the conditions that were true when they were opened (regime, option side, confidence,
 * opportunity score, time of day) and surfaces which conditions actually make money.
 *
 * Pure aggregation over existing collections (Trade + AIDecisionLog) — no external data.
 */
import { Trade } from '../models/Trade.js';
import { AIDecisionLog } from '../models/AIDecisionLog.js';
import { UserSettings } from '../models/UserSettings.js';
import { effectiveMode } from './brokers/tradingModeService.js';
import { round2 } from '../utils/format.js';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** @param {number} days @returns {Date} start of the window `days` ago (00:00 IST) */
function windowStart(days) {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const startIst = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()));
  startIst.setUTCDate(startIst.getUTCDate() - (days - 1));
  return new Date(startIst.getTime() - IST_OFFSET_MS);
}

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 };

/**
 * @param {object[]} trades closed trades (with pnl)
 * @returns {object} aggregate stats
 */
function summarize(trades) {
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins = closed.filter((t) => (t.pnl || 0) > 0);
  const losses = closed.filter((t) => (t.pnl || 0) < 0);
  const grossProfit = round2(wins.reduce((s, t) => s + t.pnl, 0));
  const grossLoss = round2(losses.reduce((s, t) => s + t.pnl, 0)); // negative
  const netPnl = round2(grossProfit + grossLoss);
  return {
    totalClosed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? round2((wins.length / closed.length) * 100) : 0,
    netPnl,
    grossProfit,
    grossLoss,
    avgWin: wins.length ? round2(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    avgPnl: closed.length ? round2(netPnl / closed.length) : 0,
    largestWin: wins.length ? round2(Math.max(...wins.map((t) => t.pnl))) : 0,
    largestLoss: losses.length ? round2(Math.min(...losses.map((t) => t.pnl))) : 0,
    // Profit factor = gross profit / gross loss magnitude. >1 profitable. Infinity when no losses.
    profitFactor: grossLoss < 0 ? round2(grossProfit / Math.abs(grossLoss)) : grossProfit > 0 ? Infinity : 0,
  };
}

/** @param {Date} d @returns {number} IST hour-of-day (0-23) */
function istHour(d) {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * Daily / weekly / monthly report. Scoped to whichever mode (paper/live) is currently
 * active — blending a paper account's simulated results into a live P&L report (or the
 * reverse) would misrepresent real trading performance.
 * @param {string} userId @param {'daily'|'weekly'|'monthly'} period
 * @returns {Promise<object>}
 */
export async function getPeriodReport(userId, period = 'daily') {
  const days = PERIOD_DAYS[period] ?? 1;
  const since = windowStart(days);
  const settings = await UserSettings.findOne({ userId }).lean();
  const mode = await effectiveMode(userId, settings);
  const trades = await Trade.find({ userId, mode, status: 'CLOSED', closedAt: { $gte: since } }).lean();

  const overall = summarize(trades);
  const aiTrades = trades.filter((t) => t.aiDecisionId);
  const aiAccuracy = summarize(aiTrades).winRate;

  // Best/worst trading hour by net P&L (only hours with trades).
  const byHour = new Map();
  for (const t of trades) {
    const h = istHour(t.closedAt);
    byHour.set(h, round2((byHour.get(h) ?? 0) + (t.pnl || 0)));
  }
  const hours = [...byHour.entries()].map(([hour, pnl]) => ({ hour, pnl }));
  hours.sort((a, b) => b.pnl - a.pnl);

  return {
    period,
    since,
    ...overall,
    aiTradeCount: aiTrades.length,
    aiAccuracy,
    bestHour: hours[0] ?? null,
    worstHour: hours.length ? hours[hours.length - 1] : null,
  };
}

const CONFIDENCE_BUCKETS = [
  { label: '<60', test: (c) => c < 60 },
  { label: '60-74', test: (c) => c >= 60 && c < 75 },
  { label: '75-89', test: (c) => c >= 75 && c < 90 },
  { label: '90+', test: (c) => c >= 90 },
];
const OPP_BUCKETS = [
  { label: '<55', test: (s) => s < 55 },
  { label: '55-69', test: (s) => s >= 55 && s < 70 },
  { label: '70-84', test: (s) => s >= 70 && s < 85 },
  { label: '85+', test: (s) => s >= 85 },
];
const MIN_SAMPLE = 3; // don't call a bucket "best/worst" on 1-2 trades

/** @param {Array<{key:string, pnl:number}>} rows @returns {object[]} per-key winRate/avgPnl/count, sorted by avgPnl desc */
function bucketStats(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.key)) groups.set(r.key, []);
    groups.get(r.key).push(r.pnl);
  }
  return [...groups.entries()]
    .map(([key, pnls]) => {
      const wins = pnls.filter((p) => p > 0).length;
      return {
        key,
        count: pnls.length,
        winRate: round2((wins / pnls.length) * 100),
        avgPnl: round2(pnls.reduce((s, p) => s + p, 0) / pnls.length),
        netPnl: round2(pnls.reduce((s, p) => s + p, 0)),
      };
    })
    .sort((a, b) => b.avgPnl - a.avgPnl);
}

/**
 * Learning insights — which conditions the AI's closed trades actually made money under.
 * Scoped to the currently active mode (paper/live), same reasoning as getPeriodReport().
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getLearningInsights(userId) {
  const settings = await UserSettings.findOne({ userId }).lean();
  const mode = await effectiveMode(userId, settings);
  // Every closed AI-triggered trade, joined to the decision that opened it (for the
  // conditions in effect at entry).
  const aiTrades = await Trade.find({ userId, mode, status: 'CLOSED', aiDecisionId: { $ne: null } }).lean();
  if (!aiTrades.length) {
    return { sampleSize: 0, overall: summarize([]), byRegime: [], byOptionType: [], byConfidence: [], byOpportunity: [], byHour: [], note: 'No closed AI trades yet — insights appear once the AI has a track record.' };
  }

  const decisionIds = aiTrades.map((t) => t.aiDecisionId).filter(Boolean);
  const decisions = await AIDecisionLog.find({ _id: { $in: decisionIds } }).lean();
  const decById = new Map(decisions.map((d) => [String(d._id), d]));

  const regimeRows = [];
  const optionRows = [];
  const confRows = [];
  const oppRows = [];
  const hourRows = [];
  for (const t of aiTrades) {
    const pnl = t.pnl || 0;
    const d = decById.get(String(t.aiDecisionId));
    hourRows.push({ key: `${istHour(t.openedAt)}:00`, pnl });
    if (t.segment === 'FNO' && t.optionType) optionRows.push({ key: t.optionType, pnl });
    if (d) {
      const regime = d.indicatorsSnapshot?.regime?.regime;
      if (regime) regimeRows.push({ key: regime, pnl });
      const conf = d.confidence ?? 0;
      confRows.push({ key: CONFIDENCE_BUCKETS.find((b) => b.test(conf))?.label ?? '?', pnl });
      if (d.opportunityScore != null) oppRows.push({ key: OPP_BUCKETS.find((b) => b.test(d.opportunityScore))?.label ?? '?', pnl });
    }
  }

  const byRegime = bucketStats(regimeRows);
  const byConfidence = bucketStats(confRows);
  const bestCondition = byRegime.filter((r) => r.count >= MIN_SAMPLE)[0] ?? null;
  const worstCondition = [...byRegime].reverse().filter((r) => r.count >= MIN_SAMPLE)[0] ?? null;

  return {
    sampleSize: aiTrades.length,
    overall: summarize(aiTrades),
    byRegime,
    byOptionType: bucketStats(optionRows),
    byConfidence,
    byOpportunity: bucketStats(oppRows),
    byHour: bucketStats(hourRows),
    bestCondition,
    worstCondition,
  };
}

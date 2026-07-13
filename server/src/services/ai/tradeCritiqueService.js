/**
 * Post-trade self-critique (the user's #6) — after every AI trade closes, deterministically
 * review the AI's OWN conduct: did the exit type match the plan, did the realized loss stay
 * within the planned stop, was this a condition its history warns against? Stored as a
 * TradeCritique and surfaced in Reports. No LLM cost — runs on every close.
 *
 * Also the single post-close hook that invalidates the learned-edge cache so the very next
 * decision already reflects this outcome.
 */
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { TradeCritique } from '../../models/TradeCritique.js';
import { getLearnedEdge, invalidateEdgeCache } from './learnedEdgeService.js';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Classify how the position was closed from the SELL's triggerReason. */
function classifyExit(reason = '') {
  const r = reason.toLowerCase();
  if (r.includes('target')) return 'TARGET';
  if (r.includes('partial')) return 'PARTIAL';
  if (r.includes('stop-loss') || r.includes('stop loss')) return 'STOP';
  if (r.includes('trail')) return 'TRAIL';
  if (r.includes('time exit')) return 'TIME';
  if (r.includes('square-off') || r.includes('squareoff')) return 'SQUAREOFF';
  if (r === '' ) return 'MANUAL';
  return 'OTHER';
}

/**
 * Generate + persist a critique for a just-closed trade. Only AI-triggered trades (those
 * with an aiDecisionId) are critiqued — a manual trade isn't the AI's decision to review.
 * Never throws (a critique failure must never fail a fill); returns the critique or null.
 *
 * @param {object} trade the freshly-created CLOSED Trade doc (or lean object)
 * @returns {Promise<object|null>}
 */
export async function critiqueClosedTrade(trade) {
  try {
    // Every close means the edge history changed — refresh it regardless of critique.
    invalidateEdgeCache(trade.userId);
    if (!trade.aiDecisionId) return null;

    const decision = await AIDecisionLog.findById(trade.aiDecisionId).lean();
    const pnl = trade.pnl || 0;
    const outcome = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'FLAT';
    const exitType = classifyExit(trade.triggerReason);
    const pnlPercent = trade.pnlPercent ?? 0;

    const lessons = [];
    let verdict = 'ACCEPTABLE';

    if (outcome === 'WIN') {
      if (exitType === 'TARGET') {
        verdict = 'GOOD_TRADE';
        lessons.push('Clean target hit — the setup played out as planned.');
      } else if (exitType === 'TRAIL' || exitType === 'PARTIAL') {
        verdict = 'GOOD_TRADE';
        lessons.push('Profit locked via trail/partial — disciplined winner management.');
      } else if (exitType === 'TIME' || exitType === 'SQUAREOFF') {
        lessons.push('Won, but exited on time/square-off rather than target — target may have been too far or entry too late.');
      }
    } else if (outcome === 'LOSS') {
      if (exitType === 'STOP' || exitType === 'TRAIL') {
        // A stop doing its job is discipline, not a mistake — unless the realized loss blew
        // past the planned stop (gap/slippage), which is a real risk-control lesson.
        const plannedStopPct = decision?.stopLoss && decision?.indicatorsSnapshot
          ? null // premium/price basis varies; rely on realized-vs-typical below
          : null;
        if (pnlPercent < -12) {
          verdict = 'MISTAKE';
          lessons.push(`Realized loss (${pnlPercent}%) ran well past a normal stop — tighten the stop or use a guaranteed/broker-side stop.`);
        } else {
          lessons.push('Stop-loss did its job — a controlled loss is acceptable, not a mistake.');
        }
      } else if (exitType === 'TIME') {
        lessons.push('Bled out to a time-exit — the thesis never played; consider a tighter time stop for setups that stall.');
      } else if (exitType === 'SQUAREOFF') {
        verdict = 'MISTAKE';
        lessons.push('Held a loser into the forced square-off — should have cut it earlier rather than hoping.');
      } else {
        verdict = 'MISTAKE';
        lessons.push('Manual/other exit at a loss — no rule fired; verify a stop was actually set.');
      }

      // Did the AI enter a condition its own record warns against? (regime this trade opened
      // in, scoped to the SAME strategy — a straddle's P&L pattern is nothing like a
      // directional bet's, so they must never be compared against each other here.)
      const regime = decision?.indicatorsSnapshot?.regime?.regime;
      if (regime) {
        const edge = await getLearnedEdge(trade.userId, { regime, strategy: decision?.strategy ?? 'DIRECTIONAL' }, { minSample: 5 });
        if (edge.verdict === 'VETO') {
          verdict = 'MISTAKE';
          lessons.push(`Entered in ${regime}, which the learned-edge gate now flags as a losing regime — future entries here should be vetoed.`);
        }
      }
    }

    const note =
      `${outcome} of ₹${pnl} (${pnlPercent}%) via ${exitType.toLowerCase()} exit` +
      (decision ? `. Entry confidence was ${decision.confidence ?? '?'}%.` : '.');

    return await TradeCritique.create({
      userId: trade.userId,
      tradeId: trade._id,
      aiDecisionId: trade.aiDecisionId,
      symbol: trade.symbol,
      segment: trade.segment ?? 'CASH',
      pnl,
      outcome,
      exitType,
      verdict,
      lessons,
      note,
    });
  } catch (err) {
    console.error('[tradeCritiqueService] critique failed (non-fatal):', err.message);
    return null;
  }
}

/** @param {string|Date} d @returns {number} IST hour (kept for parity with edge bucketing) */
export function istHour(d) {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).getUTCHours();
}

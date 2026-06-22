/**
 * AI signal ensemble.
 *
 * Combines two independent models into the final `AISignal`:
 *  1. Quant  — the deterministic technical engine (`scoreFromIndicators`).
 *  2. Claude — an LLM verdict from `llmSignalService` (optional; falls back cleanly).
 *
 * The blended result carries a `models` breakdown so the UI can show each model's
 * vote. When the Claude model is unavailable (no key / disabled / error), the
 * ensemble degrades gracefully to the Quant model alone.
 *
 * Used by the on-demand signal route and the dashboard top-picks. The 30s
 * auto-trading cron deliberately keeps using the pure Quant engine (fast, free,
 * deterministic) via `aiSignalService.getTopSignals`.
 */

import { STOCK_UNIVERSE, AI } from '../../config/constants.js';
import { marketData } from '../marketData/index.js';
import {
  scoreFromIndicators,
  computeIndicators,
  roundIndicators,
  getTopSignals,
} from '../aiSignalService.js';
import { getLlmVerdict, isLlmConfigured, llmModelName } from './llmSignalService.js';

/**
 * @typedef {import('../../types.js').AISignal} AISignal
 * @typedef {import('../../types.js').AIModelVote} AIModelVote
 * @typedef {import('../../types.js').SignalType} SignalType
 * @typedef {{ signal: SignalType, confidence: number, reason: string }} Verdict
 */

/** symbol -> display name, for the LLM prompt. */
const NAME_BY_SYMBOL = new Map(STOCK_UNIVERSE.map((u) => [u.symbol, u.name]));

/**
 * Round to a fixed number of decimals.
 * @param {number} n
 * @param {number} [dp=0]
 * @returns {number}
 */
function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Blend the Quant and Claude verdicts into a single signal + confidence + reason.
 * When `llm` is null only the Quant verdict is used.
 *
 * @param {Verdict} quant
 * @param {Verdict|null} llm
 * @returns {{ signal: SignalType, confidence: number, reason: string }}
 */
function blend(quant, llm) {
  if (!llm) {
    return { signal: quant.signal, confidence: quant.confidence, reason: quant.reason };
  }

  // Both models agree → take the shared signal and boost confidence.
  if (quant.signal === llm.signal) {
    const blended = quant.confidence * AI.quantWeight + llm.confidence * (1 - AI.quantWeight);
    const confidence = Math.min(100, round(blended + AI.agreementBoost));
    return {
      signal: quant.signal,
      confidence,
      reason: `Quant + Claude agree on ${quant.signal}. Quant: ${quant.reason}. Claude: ${llm.reason}`,
    };
  }

  // One model is directional, the other HOLD → follow the directional view, dampened.
  const quantHold = quant.signal === 'HOLD';
  const llmHold = llm.signal === 'HOLD';
  if (quantHold !== llmHold) {
    const directional = quantHold ? llm : quant;
    const directionalName = quantHold ? 'Claude' : 'Quant';
    return {
      signal: directional.signal,
      confidence: round(directional.confidence * 0.6),
      reason: `Split view: ${directionalName} sees ${directional.signal}, the other model holds. ${directional.reason}`,
    };
  }

  // Direct BUY vs SELL conflict → hold, low confidence (risk management).
  return {
    signal: 'HOLD',
    confidence: AI.conflictConfidence,
    reason: `Models conflict — Quant ${quant.signal} vs Claude ${llm.signal}; holding until they align.`,
  };
}

/**
 * Generate the ensemble AI signal for a single symbol.
 * Never throws on LLM failure — degrades to the Quant model.
 *
 * @param {string} symbol
 * @returns {Promise<AISignal>}
 */
export async function getEnsembleSignal(symbol) {
  const indicators = await computeIndicators(symbol);
  const quant = scoreFromIndicators(indicators);

  /** @type {AIModelVote[]} */
  const models = [
    { name: 'Quant', signal: quant.signal, confidence: quant.confidence, reason: quant.reason },
  ];

  /** @type {Verdict|null} */
  let llm = null;
  if (isLlmConfigured()) {
    try {
      const name = NAME_BY_SYMBOL.get(symbol) || symbol;
      const candles = await marketData.getHistory(symbol, AI.llmHistoryDays);
      let quote;
      try {
        quote = await marketData.getQuote(symbol);
      } catch {
        quote = undefined; // quote is best-effort context for the LLM
      }
      llm = await getLlmVerdict(symbol, name, indicators, candles, quote);
      models.push({ name: 'Claude', signal: llm.signal, confidence: llm.confidence, reason: llm.reason });
    } catch (err) {
      console.warn(`[ai] Claude verdict for ${symbol} unavailable: ${err.message}`);
      llm = null;
    }
  }

  const final = blend(quant, llm);

  /** @type {AISignal} */
  return {
    symbol,
    signal: final.signal,
    confidence: final.confidence,
    reason: final.reason,
    indicators: roundIndicators(indicators),
    models,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Top ensemble signals for the dashboard. To bound LLM cost, the universe is
 * ranked first by the cheap Quant model, then only the top `limit` symbols are
 * enriched with the Claude model (each cached). On any per-symbol failure the
 * Quant-only signal is kept.
 *
 * @param {number} [limit=3]
 * @returns {Promise<AISignal[]>}
 */
export async function getTopEnsembleSignals(limit = 3) {
  const base = await getTopSignals(limit); // quant-ranked top N

  const enriched = await Promise.all(
    base.map(async (sig) => {
      try {
        return await getEnsembleSignal(sig.symbol);
      } catch {
        // Keep the Quant signal, presented with a single-model breakdown.
        return {
          ...sig,
          models: [
            { name: 'Quant', signal: sig.signal, confidence: sig.confidence, reason: sig.reason },
          ],
        };
      }
    }),
  );

  return enriched;
}

/**
 * AI subsystem status for the health endpoint.
 * @returns {{ llm: boolean, model: string|null }}
 */
export function aiStatus() {
  return { llm: isLlmConfigured(), model: isLlmConfigured() ? llmModelName : null };
}

export default { getEnsembleSignal, getTopEnsembleSignals, aiStatus };

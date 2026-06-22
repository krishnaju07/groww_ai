/**
 * Claude LLM signal model.
 *
 * One of the two models in the AI signal ensemble (see `ensembleSignalService.js`).
 * Given a symbol's technical indicators + recent price action, Claude reasons over
 * the setup and returns a structured BUY/SELL/HOLD verdict with a confidence and a
 * one-line rationale. It is an INDEPENDENT model — it is NOT shown the Quant model's
 * verdict, so the ensemble combines two genuinely separate opinions.
 *
 * Safety / cost:
 *  - Disabled transparently when ANTHROPIC_API_KEY is empty or AI_LLM_ENABLED=false
 *    (callers fall back to the deterministic Quant model — the app always works).
 *  - Per-symbol TTL cache so the dashboard / on-demand paths don't re-call per poll.
 *  - Never used inside the 30s auto-trading cron.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { AI } from '../../config/constants.js';

/**
 * @typedef {import('../../types.js').SignalType} SignalType
 * @typedef {import('../../types.js').SignalIndicators} SignalIndicators
 * @typedef {import('../../types.js').Candle} Candle
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {{ signal: SignalType, confidence: number, reason: string }} LlmVerdict
 */

/** Structured-output schema: forces a valid, parseable verdict. */
const VERDICT_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    // Numeric bounds aren't enforceable in structured outputs — we clamp below.
    properties: {
      signal: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
      confidence: { type: 'integer' },
      reason: { type: 'string' },
    },
    required: ['signal', 'confidence', 'reason'],
  },
};

const SYSTEM_PROMPT = [
  'You are a disciplined intraday equity analyst for Indian (NSE) large-cap stocks.',
  'You are given one stock\'s latest technical indicators and recent daily price action.',
  'Form your OWN independent view and output a single trading signal:',
  '- signal: BUY, SELL, or HOLD.',
  '- confidence: an integer 0-100 reflecting how strong and aligned the evidence is.',
  '- reason: one concise sentence citing the dominant factors (RSI, MACD, momentum, trend, volume, price action).',
  'Be conservative: prefer HOLD when signals are mixed or weak. This is a paper-trading',
  'simulation for education — not financial advice.',
].join(' ');

/** @type {Anthropic|null} */
let client = null;
/** @type {Map<string, { value: LlmVerdict, expires: number }>} */
const cache = new Map();

/**
 * Whether the Claude model is configured and enabled.
 * @returns {boolean}
 */
export function isLlmConfigured() {
  return env.AI_LLM_ENABLED === true && Boolean(env.ANTHROPIC_API_KEY);
}

/** The Claude model id in use (for status display). */
export const llmModelName = env.AI_MODEL;

/**
 * Lazily construct the Anthropic client (only when configured).
 * @returns {Anthropic}
 */
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: AI.llmTimeoutMs,
      maxRetries: 1,
    });
  }
  return client;
}

/**
 * Round to a fixed number of decimals.
 * @param {number} n
 * @param {number} [dp=2]
 * @returns {number}
 */
function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Build the compact human-readable context block sent to the model.
 * @param {string} symbol
 * @param {string} name
 * @param {SignalIndicators} indicators
 * @param {Candle[]} candles
 * @param {StockQuote} [quote]
 * @returns {string}
 */
function buildPrompt(symbol, name, indicators, candles, quote) {
  const recent = candles.slice(-AI.llmRecentCandles);
  const rows = recent
    .map((c) => `${c.date}  O:${round(c.open)} H:${round(c.high)} L:${round(c.low)} C:${round(c.close)} V:${c.volume}`)
    .join('\n');

  const quoteLine = quote
    ? `Last ₹${round(quote.price)} (${quote.changePercent >= 0 ? '+' : ''}${round(quote.changePercent)}% today), day range ₹${round(quote.low)}-₹${round(quote.high)}.`
    : '';

  return [
    `Stock: ${symbol} (${name}). ${quoteLine}`,
    '',
    'Indicators:',
    `- RSI(14): ${round(indicators.rsi, 1)}`,
    `- MACD histogram: ${round(indicators.macd, 4)}`,
    `- Momentum (10d %): ${round(indicators.momentum, 2)}`,
    `- Volume ratio (vs 20d avg): ${round(indicators.volumeRatio, 2)}x`,
    `- SMA20: ${round(indicators.sma20)}  SMA50: ${round(indicators.sma50)}  (${indicators.sma20 > indicators.sma50 ? 'uptrend' : indicators.sma20 < indicators.sma50 ? 'downtrend' : 'flat'})`,
    '',
    `Recent ${recent.length} daily candles (oldest first):`,
    rows,
    '',
    'Output your verdict for the next session.',
  ].join('\n');
}

/**
 * Extract and validate the structured verdict from a Claude response.
 * @param {import('@anthropic-ai/sdk').Anthropic.Message} message
 * @returns {LlmVerdict}
 * @throws {Error} when the response is missing/invalid
 */
function parseVerdict(message) {
  const textBlock = (message.content || []).find((b) => b.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('LLM returned no text content');
  }
  const parsed = JSON.parse(textBlock.text);

  const signal = String(parsed.signal || '').toUpperCase();
  if (!['BUY', 'SELL', 'HOLD'].includes(signal)) {
    throw new Error(`LLM returned invalid signal: ${parsed.signal}`);
  }

  const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence))));
  if (!Number.isFinite(confidence)) {
    throw new Error('LLM returned invalid confidence');
  }

  const reason = String(parsed.reason || '').trim() || 'No rationale provided.';

  return { signal: /** @type {SignalType} */ (signal), confidence, reason };
}

/**
 * Get the Claude model's verdict for a symbol. Cached per symbol for
 * `AI.llmCacheTtlMs`. Throws if not configured or the call fails — callers
 * (the ensemble) catch this and fall back to the Quant model.
 *
 * @param {string} symbol
 * @param {string} name
 * @param {SignalIndicators} indicators
 * @param {Candle[]} candles
 * @param {StockQuote} [quote]
 * @returns {Promise<LlmVerdict>}
 */
export async function getLlmVerdict(symbol, name, indicators, candles, quote) {
  if (!isLlmConfigured()) {
    throw new Error('LLM model not configured');
  }

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expires > now) {
    return hit.value;
  }

  const message = await getClient().messages.create({
    model: env.AI_MODEL,
    max_tokens: AI.llmMaxTokens,
    system: SYSTEM_PROMPT,
    // effort low: this is a focused classification — keep it fast and cheap.
    output_config: { effort: 'low', format: VERDICT_FORMAT },
    messages: [{ role: 'user', content: buildPrompt(symbol, name, indicators, candles, quote) }],
  });

  const verdict = parseVerdict(message);
  cache.set(symbol, { value: verdict, expires: now + AI.llmCacheTtlMs });
  return verdict;
}

export default { getLlmVerdict, isLlmConfigured, llmModelName };

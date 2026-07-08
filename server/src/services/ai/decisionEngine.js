/**
 * LLM-driven decision engine. Flow: buildContext -> (LLM + Quant) -> persist
 * AIDecisionLog (always, even WAIT) -> caller runs riskManager.canTrade() -> orderService.
 * The LLM provider (Claude or OpenAI) is a live per-user toggle (UserSettings.aiProvider,
 * switchable from Settings without a restart) — advisory only; the Quant scorer
 * (aiSignalService.js) runs alongside as a cheap cross-check. A malformed/out-of-range
 * LLM response is never trusted as-is — it's clamped/validated or discarded in favor of
 * the Quant result, never turned into an order.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { UserSettings } from '../../models/UserSettings.js';
import { buildContext } from './contextBuilder.js';
import { buildSystemPrompt, buildUserContent, DECISION_SCHEMA } from './decisionPrompt.js';
import { scoreQuant } from './aiSignalService.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { round2 } from '../../utils/format.js';

const anthropicClient = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
const openaiClient = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const SCORE_KEYS = ['trendConfluence', 'momentum', 'volumeConviction', 'newsSentiment', 'trackRecord'];

/** @param {number} n @returns {number} clamped to a 0-100 integer, defaulting to neutral (50) if not a finite number */
function clampScore(n) {
  return Number.isFinite(Number(n)) ? Math.max(0, Math.min(100, Math.round(Number(n)))) : 50;
}

function sanitizeDecision(raw, providerLabel) {
  if (!raw || !['BUY', 'SELL', 'WAIT'].includes(raw.action)) {
    throw new Error(`${providerLabel} response missing a valid action`);
  }
  const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
  const stopLoss = Number(raw.stopLoss);
  const target = Number(raw.target);
  if (raw.action !== 'WAIT' && (!Number.isFinite(stopLoss) || !Number.isFinite(target) || stopLoss <= 0 || target <= 0)) {
    throw new Error(`${providerLabel} response has invalid stopLoss/target for a BUY/SELL`);
  }
  const scoreBreakdown = SCORE_KEYS.reduce((acc, key) => {
    acc[key] = clampScore(raw.scoreBreakdown?.[key]);
    return acc;
  }, {});
  return {
    action: raw.action,
    quantity,
    stopLoss: Number.isFinite(stopLoss) ? round2(stopLoss) : 0,
    target: Number.isFinite(target) ? round2(target) : 0,
    reason: String(raw.reason ?? '').slice(0, 500),
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0))),
    justification: String(raw.justification ?? '').slice(0, 1000),
    scoreBreakdown,
  };
}

async function callClaude(symbol, ctx) {
  // Adaptive-thinking tokens draw from this same max_tokens budget, not a separate
  // allowance — 1024 was tight enough that non-trivial thinking on a multi-signal
  // prompt could consume the whole budget before the schema-constrained JSON text
  // block gets emitted, truncating the response. This fails safe (falls back to
  // Quant / counts as no-agreement) but was silently weakening the ensemble
  // "both models must agree" safety net more often than it should.
  const response = await anthropicClient.messages.create({
    model: env.AI_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: DECISION_SCHEMA },
    },
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserContent(symbol, ctx) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to answer (refusal)');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude response had no text block');
  return sanitizeDecision(JSON.parse(textBlock.text), 'Claude');
}

async function callOpenAI(symbol, ctx) {
  const response = await openaiClient.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserContent(symbol, ctx) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'trade_decision', schema: DECISION_SCHEMA, strict: true },
    },
  });

  const choice = response.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    throw new Error('OpenAI declined to answer (content filter)');
  }
  const text = choice?.message?.content;
  if (!text) throw new Error('OpenAI response had no content');
  return sanitizeDecision(JSON.parse(text), 'OpenAI');
}

const PROVIDERS = {
  claude: { label: 'Claude', client: () => anthropicClient, call: callClaude, enabledFlag: () => Boolean(env.ANTHROPIC_API_KEY) },
  openai: { label: 'OpenAI', client: () => openaiClient, call: callOpenAI, enabledFlag: () => Boolean(env.OPENAI_API_KEY) },
};

/**
 * Reusable provider dispatch — the same Claude/OpenAI call `decide()` uses
 * internally, exposed so other callers (e.g. autoTradingService's ensemble
 * confirmation, aiScanJob's background sweep) can get a single LLM opinion
 * without going through decide()'s own quant-call + AIDecisionLog write.
 * @param {string} providerKey 'claude'|'openai'
 * @param {string} symbol
 * @param {import('../../types.js').IndicatorSnapshot} ctx
 * @returns {Promise<import('../../types.js').AiDecision & {providerLabel: string}>}
 */
export async function callProvider(providerKey, symbol, ctx) {
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.openai;
  if (!env.AI_LLM_ENABLED || !provider.enabledFlag()) {
    const e = new Error(`${provider.label} is not enabled/configured.`);
    e.code = 'PROVIDER_UNAVAILABLE';
    throw e;
  }
  const result = await provider.call(symbol, ctx);
  return { ...result, providerLabel: provider.label };
}

/**
 * @param {string} userId
 * @param {string} symbol
 * @returns {Promise<import('../../types.js').AiDecision & {decisionId: string, models: object[]}>}
 */
export async function decide(userId, symbol) {
  const ctx = await buildContext(symbol, userId);
  const quant = scoreQuant(symbol, ctx);

  const settings = await UserSettings.findOne({ userId }).lean();
  const providerKey = settings?.aiProvider ?? 'openai';
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.openai;

  let llm = null;
  if (env.AI_LLM_ENABLED && provider.enabledFlag()) {
    try {
      llm = await provider.call(symbol, ctx);
    } catch (err) {
      console.error(`[decisionEngine] ${provider.label} call failed for ${symbol}, falling back to Quant:`, err.message);
    }
  }

  const primary = llm ?? quant;
  const models = [
    { name: 'Quant', action: quant.action, confidence: quant.confidence },
    ...(llm ? [{ name: provider.label, action: llm.action, confidence: llm.confidence }] : []),
  ];

  const log = await AIDecisionLog.create({
    userId,
    symbol,
    action: primary.action,
    quantity: primary.quantity,
    stopLoss: primary.stopLoss || null,
    target: primary.target || null,
    reason: primary.reason,
    confidence: primary.confidence,
    // Only the LLM path produces these (the Quant cross-check is a cheap deterministic
    // scorer with no news/track-record input) — absent whenever quant is the primary,
    // e.g. the LLM call failed and this fell back.
    justification: primary.justification ?? '',
    scoreBreakdown: primary.scoreBreakdown ?? undefined,
    models,
    indicatorsSnapshot: ctx,
  });

  return { ...primary, decisionId: String(log._id), models, indicatorsSnapshot: ctx };
}

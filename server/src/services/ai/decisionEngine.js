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
import { getRiskConfig } from '../risk/riskConfig.js';
import { buildContext, buildOptionsContext } from './contextBuilder.js';
import {
  buildSystemPrompt,
  buildUserContent,
  DECISION_SCHEMA,
  buildOptionsSystemPrompt,
  buildOptionsUserContent,
  OPTIONS_DECISION_SCHEMA,
} from './decisionPrompt.js';
import { scoreQuant, scoreQuantOptions } from './aiSignalService.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { round2 } from '../../utils/format.js';
import { OPTION_UNDERLYINGS, OPTION_TYPES } from '../../config/constants.js';
import { marketData } from '../marketData/index.js';
import { getNearestExpiry, getOptionChain, getAtmStrike } from '../instruments/instrumentService.js';

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

/** Options counterpart to sanitizeDecision() — action is BUY/WAIT only (this platform never opens a short option position), and a BUY requires a valid optionType/strike/target/stopLoss. */
function sanitizeOptionsDecision(raw, providerLabel) {
  if (!raw || !['BUY', 'WAIT'].includes(raw.action)) {
    throw new Error(`${providerLabel} options response missing a valid action`);
  }
  const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
  const stopLoss = Number(raw.stopLoss);
  const target = Number(raw.target);
  const optionType = OPTION_TYPES.includes(raw.optionType) ? raw.optionType : null;
  if (raw.action === 'BUY') {
    if (!optionType) throw new Error(`${providerLabel} options response is BUY but missing a valid optionType (CE/PE)`);
    if (!Number.isFinite(stopLoss) || !Number.isFinite(target) || stopLoss <= 0 || target <= 0) {
      throw new Error(`${providerLabel} options response has invalid stopLoss/target for a BUY`);
    }
  }
  const scoreBreakdown = SCORE_KEYS.reduce((acc, key) => {
    acc[key] = clampScore(raw.scoreBreakdown?.[key]);
    return acc;
  }, {});
  return {
    action: raw.action,
    optionType: raw.action === 'BUY' ? optionType : null,
    quantity,
    stopLoss: Number.isFinite(stopLoss) ? round2(stopLoss) : 0,
    target: Number.isFinite(target) ? round2(target) : 0,
    reason: String(raw.reason ?? '').slice(0, 500),
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0))),
    justification: String(raw.justification ?? '').slice(0, 1000),
    scoreBreakdown,
  };
}

/**
 * Adaptive-thinking tokens draw from this same max_tokens budget, not a separate
 * allowance — 1024 was tight enough that non-trivial thinking on a multi-signal
 * prompt could consume the whole budget before the schema-constrained JSON text
 * block gets emitted, truncating the response. This fails safe (falls back to
 * Quant / counts as no-agreement) but was silently weakening the ensemble
 * "both models must agree" safety net more often than it should. Shared by the
 * equity and options prompts alike — only the systemPrompt/userContent/schema differ.
 * @param {string} systemPrompt @param {string} userContent @param {object} schema
 * @returns {Promise<object>} the raw (unsanitized) parsed JSON response
 */
async function callClaudeRaw(systemPrompt, userContent, schema) {
  const response = await anthropicClient.messages.create({
    model: env.AI_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema },
    },
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to answer (refusal)');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude response had no text block');
  return JSON.parse(textBlock.text);
}

/** @param {string} systemPrompt @param {string} userContent @param {object} schema @returns {Promise<object>} the raw (unsanitized) parsed JSON response */
async function callOpenAIRaw(systemPrompt, userContent, schema) {
  const response = await openaiClient.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'trade_decision', schema, strict: true },
    },
  });

  const choice = response.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    throw new Error('OpenAI declined to answer (content filter)');
  }
  const text = choice?.message?.content;
  if (!text) throw new Error('OpenAI response had no content');
  return JSON.parse(text);
}

async function callClaude(symbol, ctx) {
  const raw = await callClaudeRaw(buildSystemPrompt(), buildUserContent(symbol, ctx), DECISION_SCHEMA);
  return sanitizeDecision(raw, 'Claude');
}

async function callOpenAI(symbol, ctx) {
  const raw = await callOpenAIRaw(buildSystemPrompt(), buildUserContent(symbol, ctx), DECISION_SCHEMA);
  return sanitizeDecision(raw, 'OpenAI');
}

async function callClaudeOptions(ctx) {
  const raw = await callClaudeRaw(buildOptionsSystemPrompt(), buildOptionsUserContent(ctx), OPTIONS_DECISION_SCHEMA);
  return sanitizeOptionsDecision(raw, 'Claude');
}

async function callOpenAIOptions(ctx) {
  const raw = await callOpenAIRaw(buildOptionsSystemPrompt(), buildOptionsUserContent(ctx), OPTIONS_DECISION_SCHEMA);
  return sanitizeOptionsDecision(raw, 'OpenAI');
}

const PROVIDERS = {
  claude: { label: 'Claude', client: () => anthropicClient, call: callClaude, enabledFlag: () => Boolean(env.ANTHROPIC_API_KEY) },
  openai: { label: 'OpenAI', client: () => openaiClient, call: callOpenAI, enabledFlag: () => Boolean(env.OPENAI_API_KEY) },
};

const OPTIONS_PROVIDERS = {
  claude: { label: 'Claude', call: callClaudeOptions, enabledFlag: () => Boolean(env.ANTHROPIC_API_KEY) },
  openai: { label: 'OpenAI', call: callOpenAIOptions, enabledFlag: () => Boolean(env.OPENAI_API_KEY) },
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
 * Options counterpart to callProvider() — same rationale (autoTradingService's
 * ensemble confirmation for options auto-trading, without going through
 * decideOptions()'s own quant-call + AIDecisionLog write).
 * @param {string} providerKey 'claude'|'openai'
 * @param {import('../../types.js').OptionsIndicatorSnapshot} ctx
 * @returns {Promise<import('../../types.js').AiOptionsDecision & {providerLabel: string}>}
 */
export async function callProviderOptions(providerKey, ctx) {
  const provider = OPTIONS_PROVIDERS[providerKey] ?? OPTIONS_PROVIDERS.openai;
  if (!env.AI_LLM_ENABLED || !provider.enabledFlag()) {
    const e = new Error(`${provider.label} is not enabled/configured.`);
    e.code = 'PROVIDER_UNAVAILABLE';
    throw e;
  }
  const result = await provider.call(ctx);
  return { ...result, providerLabel: provider.label };
}

/**
 * @param {string} userId
 * @param {string} symbol
 * @returns {Promise<import('../../types.js').AiDecision & {decisionId: string, models: object[]}>}
 */
export async function decide(userId, symbol) {
  const [ctx, settings, riskConfig] = await Promise.all([
    buildContext(symbol, userId),
    UserSettings.findOne({ userId }).lean(),
    getRiskConfig(userId),
  ]);
  const quant = scoreQuant(symbol, ctx, settings?.autoInvest?.amountPerTrade, riskConfig.maxLossPerTrade);

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

/**
 * Resolves an underlying symbol (e.g. 'NIFTY') to a concrete tradeable contract pair:
 * the nearest upcoming expiry and the strike closest to the current spot price (ATM),
 * with both the CE and PE instrument at that strike/expiry.
 * @param {string} underlyingSymbol
 * @returns {Promise<{underlying:string, spotSymbol:string, strike:number, expiry:Date, lotSize:number,
 *   ce:{tradingSymbol:string, growwSymbol:string}, pe:{tradingSymbol:string, growwSymbol:string}}>}
 */
export async function resolveOptionContract(underlyingSymbol) {
  const config = OPTION_UNDERLYINGS.find((u) => u.symbol === underlyingSymbol);
  if (!config) throw new Error(`Unknown option underlying '${underlyingSymbol}'`);

  const spotPrice = await marketData.getLTP(config.spotSymbol);
  const expiry = await getNearestExpiry(config.growwUnderlyingSymbol);
  if (!expiry) {
    throw new Error(`No option expiries found for ${underlyingSymbol} — instrument data may not be synced yet.`);
  }
  const strike = await getAtmStrike(config.growwUnderlyingSymbol, expiry, spotPrice);
  const chain = await getOptionChain(config.growwUnderlyingSymbol, expiry);
  const atStrike = chain.find((c) => c.strike === strike);
  if (!atStrike?.ce || !atStrike?.pe) {
    throw new Error(`Incomplete option chain for ${underlyingSymbol} at strike ${strike} (expiry ${expiry.toISOString().slice(0, 10)}) — missing CE or PE.`);
  }

  return {
    underlying: config.growwUnderlyingSymbol,
    spotSymbol: config.spotSymbol,
    strike,
    expiry,
    lotSize: atStrike.ce.lotSize ?? atStrike.pe.lotSize,
    ce: { tradingSymbol: atStrike.ce.tradingSymbol, growwSymbol: atStrike.ce.growwSymbol },
    pe: { tradingSymbol: atStrike.pe.tradingSymbol, growwSymbol: atStrike.pe.growwSymbol },
  };
}

/**
 * Options counterpart to decide() — same LLM+Quant ensemble shape, but for a fresh
 * options entry on an underlying index (e.g. 'NIFTY') rather than an equity symbol.
 * Resolves the nearest-expiry ATM strike, builds options context (both CE and PE at
 * that strike), runs Quant (and the configured LLM, same fallback-on-failure
 * behavior as decide()), and returns a decision keyed to whichever contract
 * (CE or PE) was chosen — `tradingSymbol` is what orderService.placeOrder expects
 * as `symbol` for an FNO order.
 * @param {string} userId @param {string} underlyingSymbol e.g. 'NIFTY'
 * @returns {Promise<import('../../types.js').AiOptionsDecision & {decisionId:string, models:object[], tradingSymbol:string|null, underlying:string, strike:number, expiry:Date, lotSize:number}>}
 */
export async function decideOptions(userId, underlyingSymbol) {
  const contract = await resolveOptionContract(underlyingSymbol);
  const [ctx, settings, riskConfig] = await Promise.all([
    buildOptionsContext(contract, userId),
    UserSettings.findOne({ userId }).lean(),
    getRiskConfig(userId),
  ]);
  const quant = scoreQuantOptions(ctx, settings?.autoInvest?.amountPerTrade, riskConfig.maxLossPerTrade);

  const providerKey = settings?.aiProvider ?? 'openai';
  const provider = OPTIONS_PROVIDERS[providerKey] ?? OPTIONS_PROVIDERS.openai;

  let llm = null;
  if (env.AI_LLM_ENABLED && provider.enabledFlag()) {
    try {
      llm = await provider.call(ctx);
    } catch (err) {
      console.error(`[decisionEngine] ${provider.label} options call failed for ${underlyingSymbol}, falling back to Quant:`, err.message);
    }
  }

  const primary = llm ?? quant;
  const models = [
    { name: 'Quant', action: quant.action, confidence: quant.confidence },
    ...(llm ? [{ name: provider.label, action: llm.action, confidence: llm.confidence }] : []),
  ];

  const tradingSymbol = primary.action === 'BUY' ? contract[primary.optionType.toLowerCase()].tradingSymbol : null;

  const log = await AIDecisionLog.create({
    userId,
    symbol: tradingSymbol ?? `${contract.underlying}-${contract.strike}-${contract.expiry.toISOString().slice(0, 10)}`,
    segment: 'FNO',
    underlying: contract.underlying,
    strike: contract.strike,
    expiry: contract.expiry,
    optionType: primary.optionType,
    lotSize: contract.lotSize,
    action: primary.action,
    quantity: primary.quantity,
    stopLoss: primary.stopLoss || null,
    target: primary.target || null,
    reason: primary.reason,
    confidence: primary.confidence,
    justification: primary.justification ?? '',
    scoreBreakdown: primary.scoreBreakdown ?? undefined,
    models,
    indicatorsSnapshot: ctx,
  });

  return {
    ...primary,
    decisionId: String(log._id),
    models,
    indicatorsSnapshot: ctx,
    tradingSymbol,
    underlying: contract.underlying,
    strike: contract.strike,
    expiry: contract.expiry,
    lotSize: contract.lotSize,
  };
}

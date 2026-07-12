/**
 * LLM-driven decision engine. Flow: buildContext -> (LLM + Quant) -> persist
 * AIDecisionLog (always, even WAIT) -> caller runs riskManager.canTrade() -> orderService.
 * The LLM provider (Claude, OpenAI, Gemini, Grok, or Perplexity) is a live per-user
 * toggle (UserSettings.aiProvider, switchable from Settings without a restart) —
 * advisory only; the Quant scorer (aiSignalService.js) runs alongside as a cheap
 * cross-check. A malformed/out-of-range LLM response is never trusted as-is — it's
 * clamped/validated or discarded in favor of the Quant result, never turned into an order.
 * Claude is called via the Anthropic SDK; every other provider is called via the OpenAI
 * SDK pointed at that provider's own OpenAI-compatible endpoint (Gemini, xAI/Grok, and
 * Perplexity all publish one) — see makeOpenAICompatProvider below. This avoids a
 * bespoke SDK/client per provider for what is, structurally, the same request shape.
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

// OpenAI-compatible endpoints — verified against each provider's own docs (base URLs
// and structured-output/json_schema support change occasionally; re-check if a
// provider starts erroring where it previously worked).
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const GROK_BASE_URL = 'https://api.x.ai/v1';
const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';

const geminiClient = env.GEMINI_API_KEY ? new OpenAI({ apiKey: env.GEMINI_API_KEY, baseURL: GEMINI_BASE_URL }) : null;
const grokClient = env.GROK_API_KEY ? new OpenAI({ apiKey: env.GROK_API_KEY, baseURL: GROK_BASE_URL }) : null;
const perplexityClient = env.PERPLEXITY_API_KEY ? new OpenAI({ apiKey: env.PERPLEXITY_API_KEY, baseURL: PERPLEXITY_BASE_URL }) : null;

const SCORE_KEYS = ['trendConfluence', 'momentum', 'volumeConviction', 'newsSentiment', 'trackRecord'];

let logSeq = 0;
// The equity/options system prompts are static text (no per-call variation) — printing
// the full block on every single tick's LLM call would flood the terminal over a trading
// day for no new information. Print it in full only the first time this exact text is
// seen; every later call with the SAME text gets a one-line pointer back to that log id.
const seenSystemPrompts = new Map(); // systemPrompt string -> the [AI #id] it was first printed under

/**
 * Debug visibility into the actual LLM traffic (env.AI_DEBUG_LOG, on by default) — prints
 * the exact model/system-prompt/user-content sent and the raw JSON received, so it's clear
 * a real API call happened (vs. the quant fallback) and exactly what it was asked/told.
 * @param {string} label provider label (Claude/OpenAI/Gemini/Grok/Perplexity)
 * @param {string} model @param {string} systemPrompt @param {string} userContent
 */
function logAiRequest(label, model, systemPrompt, userContent) {
  if (!env.AI_DEBUG_LOG) return null;
  const id = ++logSeq;
  console.log(`\n[AI #${id}] --> ${label} (${model}) REQUEST @ ${new Date().toISOString()}`);
  const firstSeenId = seenSystemPrompts.get(systemPrompt);
  if (firstSeenId == null) {
    seenSystemPrompts.set(systemPrompt, id);
    console.log(`[AI #${id}] system:\n${systemPrompt}`);
  } else {
    console.log(`[AI #${id}] system: unchanged since [AI #${firstSeenId}] (${systemPrompt.length} chars)`);
  }
  console.log(`[AI #${id}] user:\n${userContent}`);
  return { id, startedAt: Date.now() };
}

/** @param {{id:number, startedAt:number}|null} handle @param {object} raw @param {Error} [err] */
function logAiResponse(handle, raw, err) {
  if (!handle) return;
  const ms = Date.now() - handle.startedAt;
  if (err) {
    console.log(`[AI #${handle.id}] <-- FAILED after ${ms}ms: ${err.message}\n`);
  } else {
    console.log(`[AI #${handle.id}] <-- response after ${ms}ms:\n${JSON.stringify(raw, null, 2)}\n`);
  }
}

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
async function callClaudeRaw(systemPrompt, userContent, schema, model) {
  const handle = logAiRequest('Claude', model, systemPrompt, userContent);
  try {
    const response = await anthropicClient.messages.create({
      model,
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
    const parsed = JSON.parse(textBlock.text);
    logAiResponse(handle, parsed);
    return parsed;
  } catch (err) {
    logAiResponse(handle, null, err);
    throw err;
  }
}

/**
 * Shared by every OpenAI-compatible provider (OpenAI itself, Gemini, Grok, Perplexity) —
 * only the client (base URL + key) and model id differ between them.
 * @param {OpenAI} client @param {string} model @param {string} systemPrompt @param {string} userContent @param {object} schema
 * @returns {Promise<object>} the raw (unsanitized) parsed JSON response
 */
async function callOpenAICompatRaw(client, model, systemPrompt, userContent, schema, providerLabel = 'Provider') {
  const handle = logAiRequest(providerLabel, model, systemPrompt, userContent);
  try {
    const response = await client.chat.completions.create({
      model,
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
      throw new Error('Provider declined to answer (content filter)');
    }
    const text = choice?.message?.content;
    if (!text) throw new Error('Provider response had no content');
    const parsed = JSON.parse(text);
    logAiResponse(handle, parsed);
    return parsed;
  } catch (err) {
    logAiResponse(handle, null, err);
    throw err;
  }
}

async function callClaude(symbol, ctx, modelOverride) {
  const raw = await callClaudeRaw(buildSystemPrompt(), buildUserContent(symbol, ctx), DECISION_SCHEMA, modelOverride || env.AI_MODEL);
  return sanitizeDecision(raw, 'Claude');
}

async function callClaudeOptions(ctx, modelOverride) {
  const raw = await callClaudeRaw(buildOptionsSystemPrompt(), buildOptionsUserContent(ctx), OPTIONS_DECISION_SCHEMA, modelOverride || env.AI_MODEL);
  return sanitizeOptionsDecision(raw, 'Claude');
}

/**
 * Builds a PROVIDERS/OPTIONS_PROVIDERS-shaped pair of entries for any OpenAI-compatible
 * provider — used for openai/gemini/grok/perplexity alike, so adding a new one is just
 * one call here plus a client/env entry above, not a new bespoke call+Options pair.
 * `call`/`options.call` accept an optional per-call model override (see
 * UserSettings.aiModel) — falls back to `defaultModel` (the env-configured one) when
 * not given, so this is fully backward compatible with a user who's never touched it.
 * @param {string} label @param {OpenAI|null} client @param {string} defaultModel @param {() => boolean} enabledFlag
 * @returns {{equity: object, options: object}}
 */
function makeOpenAICompatProvider(label, client, defaultModel, enabledFlag) {
  return {
    equity: {
      label,
      enabledFlag,
      defaultModel,
      call: async (symbol, ctx, modelOverride) => {
        const raw = await callOpenAICompatRaw(client, modelOverride || defaultModel, buildSystemPrompt(), buildUserContent(symbol, ctx), DECISION_SCHEMA, label);
        return sanitizeDecision(raw, label);
      },
    },
    options: {
      label,
      enabledFlag,
      defaultModel,
      call: async (ctx, modelOverride) => {
        const raw = await callOpenAICompatRaw(client, modelOverride || defaultModel, buildOptionsSystemPrompt(), buildOptionsUserContent(ctx), OPTIONS_DECISION_SCHEMA, label);
        return sanitizeOptionsDecision(raw, label);
      },
    },
  };
}

const openaiProvider = makeOpenAICompatProvider('OpenAI', openaiClient, env.OPENAI_MODEL, () => Boolean(env.OPENAI_API_KEY));
const geminiProvider = makeOpenAICompatProvider('Gemini', geminiClient, env.GEMINI_MODEL, () => Boolean(env.GEMINI_API_KEY));
const grokProvider = makeOpenAICompatProvider('Grok', grokClient, env.GROK_MODEL, () => Boolean(env.GROK_API_KEY));
const perplexityProvider = makeOpenAICompatProvider('Perplexity', perplexityClient, env.PERPLEXITY_MODEL, () => Boolean(env.PERPLEXITY_API_KEY));

const PROVIDERS = {
  claude: { label: 'Claude', call: callClaude, enabledFlag: () => Boolean(env.ANTHROPIC_API_KEY), defaultModel: env.AI_MODEL },
  openai: openaiProvider.equity,
  gemini: geminiProvider.equity,
  grok: grokProvider.equity,
  perplexity: perplexityProvider.equity,
};

/**
 * Provider keys that are actually usable right now (LLM master switch on AND an API key
 * configured) — the roster the consensus engine polls. Order is stable for deterministic
 * vote display.
 * @returns {string[]}
 */
export function getEnabledProviderKeys() {
  if (!env.AI_LLM_ENABLED) return [];
  return Object.keys(PROVIDERS).filter((k) => PROVIDERS[k].enabledFlag());
}

const OPTIONS_PROVIDERS = {
  claude: { label: 'Claude', call: callClaudeOptions, enabledFlag: () => Boolean(env.ANTHROPIC_API_KEY), defaultModel: env.AI_MODEL },
  openai: openaiProvider.options,
  gemini: geminiProvider.options,
  grok: grokProvider.options,
  perplexity: perplexityProvider.options,
};

/**
 * Reusable provider dispatch — the same LLM call `decide()` uses
 * internally, exposed so other callers (e.g. autoTradingService's ensemble
 * confirmation, aiScanJob's background sweep) can get a single LLM opinion
 * without going through decide()'s own quant-call + AIDecisionLog write.
 * @param {string} providerKey 'claude'|'openai'|'gemini'|'grok'|'perplexity'
 * @param {string} symbol
 * @param {import('../../types.js').IndicatorSnapshot} ctx
 * @param {string} [modelOverride] a specific model id (UserSettings.aiModel) — falls back to that provider's env-configured default when omitted/empty
 * @returns {Promise<import('../../types.js').AiDecision & {providerLabel: string, modelUsed: string}>}
 */
export async function callProvider(providerKey, symbol, ctx, modelOverride) {
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.openai;
  if (!env.AI_LLM_ENABLED || !provider.enabledFlag()) {
    const e = new Error(`${provider.label} is not enabled/configured.`);
    e.code = 'PROVIDER_UNAVAILABLE';
    throw e;
  }
  const result = await provider.call(symbol, ctx, modelOverride);
  return { ...result, providerLabel: provider.label, modelUsed: modelOverride || provider.defaultModel };
}

/**
 * Options counterpart to callProvider() — same rationale (autoTradingService's
 * ensemble confirmation for options auto-trading, without going through
 * decideOptions()'s own quant-call + AIDecisionLog write).
 * @param {string} providerKey 'claude'|'openai'|'gemini'|'grok'|'perplexity'
 * @param {import('../../types.js').OptionsIndicatorSnapshot} ctx
 * @param {string} [modelOverride] a specific model id (UserSettings.aiModel) — falls back to that provider's env-configured default when omitted/empty
 * @returns {Promise<import('../../types.js').AiOptionsDecision & {providerLabel: string, modelUsed: string}>}
 */
export async function callProviderOptions(providerKey, ctx, modelOverride) {
  const provider = OPTIONS_PROVIDERS[providerKey] ?? OPTIONS_PROVIDERS.openai;
  if (!env.AI_LLM_ENABLED || !provider.enabledFlag()) {
    const e = new Error(`${provider.label} is not enabled/configured.`);
    e.code = 'PROVIDER_UNAVAILABLE';
    throw e;
  }
  const result = await provider.call(ctx, modelOverride);
  return { ...result, providerLabel: provider.label, modelUsed: modelOverride || provider.defaultModel };
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
  const modelToUse = settings?.aiModel || provider.defaultModel;

  let llm = null;
  if (env.AI_LLM_ENABLED && provider.enabledFlag()) {
    try {
      llm = await provider.call(symbol, ctx, settings?.aiModel);
    } catch (err) {
      console.error(`[decisionEngine] ${provider.label} (${modelToUse}) call failed for ${symbol}, falling back to Quant:`, err.message);
    }
  }

  const primary = llm ?? quant;
  const models = [
    { name: 'Quant', action: quant.action, confidence: quant.confidence },
    ...(llm ? [{ name: provider.label, model: modelToUse, action: llm.action, confidence: llm.confidence }] : []),
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
  const modelToUse = settings?.aiModel || provider.defaultModel;

  let llm = null;
  if (env.AI_LLM_ENABLED && provider.enabledFlag()) {
    try {
      llm = await provider.call(ctx, settings?.aiModel);
    } catch (err) {
      console.error(`[decisionEngine] ${provider.label} (${modelToUse}) options call failed for ${underlyingSymbol}, falling back to Quant:`, err.message);
    }
  }

  const primary = llm ?? quant;
  const models = [
    { name: 'Quant', action: quant.action, confidence: quant.confidence },
    ...(llm ? [{ name: provider.label, model: modelToUse, action: llm.action, confidence: llm.confidence }] : []),
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
    // The opportunity score is always the Quant scanner's — the LLM refines direction/
    // sizing but the 0-100 setup-quality rank is the deterministic scanner's output.
    opportunityScore: quant.opportunityScore ?? null,
    justification: primary.justification ?? '',
    scoreBreakdown: primary.scoreBreakdown ?? undefined,
    models,
    indicatorsSnapshot: ctx,
  });

  return {
    ...primary,
    opportunityScore: quant.opportunityScore ?? null,
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

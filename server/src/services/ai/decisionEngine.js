/**
 * Claude-driven decision engine. Flow: buildContext -> (Claude + Quant) -> persist
 * AIDecisionLog (always, even WAIT) -> caller runs riskManager.canTrade() -> orderService.
 * Claude is advisory; the Quant scorer (aiSignalService.js) runs alongside as a cheap
 * cross-check. A malformed/out-of-range Claude response is never trusted as-is — it's
 * clamped/validated or discarded in favor of the Quant result, never turned into an order.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { buildContext } from './contextBuilder.js';
import { buildSystemPrompt, buildUserContent, DECISION_SCHEMA } from './decisionPrompt.js';
import { scoreQuant } from './aiSignalService.js';
import { AIDecisionLog } from '../../models/AIDecisionLog.js';
import { round2 } from '../../utils/format.js';

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

function sanitizeDecision(raw) {
  if (!raw || !['BUY', 'SELL', 'WAIT'].includes(raw.action)) {
    throw new Error('Claude response missing a valid action');
  }
  const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
  const stopLoss = Number(raw.stopLoss);
  const target = Number(raw.target);
  if (raw.action !== 'WAIT' && (!Number.isFinite(stopLoss) || !Number.isFinite(target) || stopLoss <= 0 || target <= 0)) {
    throw new Error('Claude response has invalid stopLoss/target for a BUY/SELL');
  }
  return {
    action: raw.action,
    quantity,
    stopLoss: Number.isFinite(stopLoss) ? round2(stopLoss) : 0,
    target: Number.isFinite(target) ? round2(target) : 0,
    reason: String(raw.reason ?? '').slice(0, 500),
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0))),
  };
}

async function callClaude(symbol, ctx) {
  const response = await client.messages.create({
    model: env.AI_MODEL,
    max_tokens: 1024,
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
  return sanitizeDecision(JSON.parse(textBlock.text));
}

/**
 * @param {string} userId
 * @param {string} symbol
 * @returns {Promise<import('../../types.js').AiDecision & {decisionId: string, models: object[]}>}
 */
export async function decide(userId, symbol) {
  const ctx = await buildContext(symbol);
  const quant = scoreQuant(symbol, ctx);

  let claude = null;
  if (client && env.AI_LLM_ENABLED) {
    try {
      claude = await callClaude(symbol, ctx);
    } catch (err) {
      console.error(`[decisionEngine] Claude call failed for ${symbol}, falling back to Quant:`, err.message);
    }
  }

  const primary = claude ?? quant;
  const models = [
    { name: 'Quant', action: quant.action, confidence: quant.confidence },
    ...(claude ? [{ name: 'Claude', action: claude.action, confidence: claude.confidence }] : []),
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
    models,
    indicatorsSnapshot: ctx,
  });

  return { ...primary, decisionId: String(log._id), models };
}

#!/usr/bin/env node
/**
 * Smoke-tests the configured AI provider(s) without touching the DB or placing
 * any order: a trivial ping (confirms the API key + billing work) then a full
 * decisionEngine.decide() call against a real symbol (confirms the whole
 * context -> prompt -> structured-output pipeline).
 * Usage: node scripts/verify-ai.js [--provider=openai|claude] [--symbol=RELIANCE]
 */
import { env } from '../src/config/env.js';

const providerArg = process.argv.find((a) => a.startsWith('--provider='));
const symbolArg = process.argv.find((a) => a.startsWith('--symbol='));
const provider = providerArg ? providerArg.split('=')[1] : 'openai';
const symbol = symbolArg ? symbolArg.split('=')[1] : 'RELIANCE';

async function pingOpenAI() {
  const OpenAI = (await import('openai')).default;
  if (!env.OPENAI_API_KEY) {
    console.log('[verify-ai] OPENAI_API_KEY not set — skipping OpenAI ping.');
    return false;
  }
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  console.log(`[verify-ai] pinging OpenAI (${env.OPENAI_MODEL})...`);
  const res = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }],
    max_tokens: 5,
  });
  const text = res.choices?.[0]?.message?.content?.trim();
  console.log(`[verify-ai] OpenAI replied: "${text}"`);
  return true;
}

async function pingClaude() {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  if (!env.ANTHROPIC_API_KEY) {
    console.log('[verify-ai] ANTHROPIC_API_KEY not set — skipping Claude ping.');
    return false;
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  console.log(`[verify-ai] pinging Claude (${env.AI_MODEL})...`);
  const res = await client.messages.create({
    model: env.AI_MODEL,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }],
  });
  const text = res.content.find((b) => b.type === 'text')?.text?.trim();
  console.log(`[verify-ai] Claude replied: "${text}"`);
  return true;
}

async function fullPipelineTest() {
  const { connectDb } = await import('../src/config/db.js');
  const { UserSettings } = await import('../src/models/UserSettings.js');
  const { decide } = await import('../src/services/ai/decisionEngine.js');
  const { DEFAULT_USER_ID } = await import('../src/config/constants.js');

  await connectDb();
  await UserSettings.findOneAndUpdate({ userId: DEFAULT_USER_ID }, { aiProvider: provider }, { upsert: true });

  console.log(`\n[verify-ai] running full decisionEngine.decide() for ${symbol} with provider=${provider}...`);
  const decision = await decide(DEFAULT_USER_ID, symbol);
  console.log('[verify-ai] decision:', JSON.stringify(decision, null, 2));

  const usedProvider = decision.models.some((m) => m.name.toLowerCase() === provider || (provider === 'openai' && m.name === 'OpenAI') || (provider === 'claude' && m.name === 'Claude'));
  if (usedProvider) {
    console.log(`\n✅ ${provider} answered successfully — full pipeline works.`);
  } else {
    console.log(`\n⚠️  ${provider} did NOT appear in models[] — it silently fell back to Quant-only. Check the server console for the real error.`);
  }
}

async function main() {
  try {
    if (provider === 'openai') await pingOpenAI();
    else await pingClaude();
  } catch (err) {
    console.error(`[verify-ai] ping failed (${err.code || err.status || 'error'}): ${err.message}`);
  }

  await fullPipelineTest();
  process.exit(0);
}

main().catch((err) => {
  console.error('[verify-ai] failed:', err);
  process.exit(1);
});

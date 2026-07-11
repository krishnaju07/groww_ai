/**
 * AI Consensus Engine — the vision's "each LLM votes independently; consensus decides;
 * LLMs are advisors, never the sole authority." Polls every configured LLM provider in
 * parallel for the SAME setup, then requires a minimum number of them to agree with the
 * deterministic Quant scorer's proposed direction before a trade is approved.
 *
 * Cost control is the caller's job: consensus fans out one call PER provider, so callers
 * only invoke it AFTER cheap deterministic gates (Quant actionable, opportunity score,
 * cooldown) have already flagged the setup as worth the spend.
 */
import { callProvider, callProviderOptions, getEnabledProviderKeys } from './decisionEngine.js';

/**
 * @param {{
 *   mode: 'equity'|'options',
 *   symbol?: string,                       // equity only
 *   ctx: object,
 *   quantDecision: {action:string, optionType?:string, confidence:number},
 *   aiModel?: string,
 *   minAgree?: number,
 * }} input
 * @returns {Promise<{agreed:boolean, confidence:number, votes:object[], responders:number, agreeing:number, reason:string}>}
 */
export async function runConsensus(input) {
  const { mode, symbol, ctx, quantDecision, aiModel, minAgree = 2 } = input;
  const providerKeys = getEnabledProviderKeys();

  if (!providerKeys.length) {
    return { agreed: false, confidence: 0, votes: [], responders: 0, agreeing: 0, reason: 'No LLM providers configured — consensus unavailable.' };
  }

  // Every provider reasons about the same setup independently, in parallel.
  const votes = await Promise.all(
    providerKeys.map(async (key) => {
      try {
        const d = mode === 'equity' ? await callProvider(key, symbol, ctx, aiModel) : await callProviderOptions(key, ctx, aiModel);
        return { key, provider: d.providerLabel, model: d.modelUsed, action: d.action, optionType: d.optionType ?? null, confidence: d.confidence, reason: d.reason, ok: true };
      } catch (err) {
        return { key, provider: key, ok: false, error: err.message };
      }
    }),
  );

  const responders = votes.filter((v) => v.ok);
  if (!responders.length) {
    return { agreed: false, confidence: 0, votes, responders: 0, agreeing: 0, reason: 'All LLM providers failed/unavailable — trade skipped.' };
  }

  // Quant is the deterministic backbone — its proposed direction is what the LLMs must
  // corroborate. For options, "direction" is the option side (CE/PE); a WAIT vote never
  // counts as agreement.
  const target = mode === 'equity' ? quantDecision.action : quantDecision.optionType;
  const directionOf = (v) => (mode === 'equity' ? v.action : v.action === 'BUY' ? v.optionType : v.action);
  const quantActionable = mode === 'equity' ? ['BUY', 'SELL'].includes(quantDecision.action) : quantDecision.action === 'BUY';

  const agreeing = responders.filter((v) => directionOf(v) === target);

  // With fewer live providers than the configured minimum, require ALL of them (so a
  // single-provider setup still works, just as strictly as it can). Also require the
  // agreeing side to be a majority of responders — no split decisions.
  const effectiveMinAgree = Math.min(minAgree, responders.length);
  const isMajority = agreeing.length >= Math.ceil(responders.length / 2);
  const agreed = quantActionable && agreeing.length >= effectiveMinAgree && isMajority;

  const confidence = agreed
    ? Math.round((quantDecision.confidence + agreeing.reduce((s, v) => s + v.confidence, 0)) / (agreeing.length + 1))
    : 0;

  const reason = agreed
    ? `Consensus: ${agreeing.length}/${responders.length} LLMs agree with Quant on ${target} (${agreeing.map((v) => v.provider).join(', ')}).`
    : quantActionable
      ? `No consensus: only ${agreeing.length}/${responders.length} LLMs backed Quant's ${target} (need ${effectiveMinAgree}+ and a majority).`
      : 'Quant is not actionable — nothing to seek consensus on.';

  return { agreed, confidence, votes, responders: responders.length, agreeing: agreeing.length, reason };
}

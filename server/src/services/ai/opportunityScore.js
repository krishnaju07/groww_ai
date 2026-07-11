/**
 * Opportunity Score (0-100) for a candidate option side — the vision's scanner that
 * ranks setups and, crucially, gates which contracts are worth an (expensive) LLM call.
 * Built to work TODAY on available data (directional conviction + regime alignment +
 * Black-Scholes greeks derived from premium + intraday timing) and to fold in the
 * subscription-gated chain intelligence (liquidity, PCR/OI positioning) as bonuses when
 * that data is present. Missing blocked data never zeros the score — it just means those
 * bonus components sit at a neutral midpoint.
 *
 * Philosophy (capital-first): a low score means "not worth acting on" — the correct,
 * cost-free default. Only high scores justify spending an LLM call and taking risk.
 */

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {{
 *   optionType: 'CE'|'PE',
 *   premium: number,
 *   directionalScore: number,        // signed quant score of the UNDERLYING (+bullish / -bearish), roughly -10..+10
 *   regime: {tradeable:boolean, bias:'UP'|'DOWN'|'NONE'},
 *   greeks: {delta:number, theta:number, iv:number|null}|null,
 *   liquidity: {score:number}|null,  // from optionChainIntelligence.liquidityOf, when quote data available
 *   chainIntel: {available:boolean, pcr:number|null}|null,
 *   sessionPhase: string,
 * }} input
 * @returns {{score:number, breakdown:object, reasons:string[]}}
 */
export function computeOpportunityScore(input) {
  const { optionType, premium, directionalScore, regime, greeks, liquidity, chainIntel, sessionPhase } = input;
  const reasons = [];
  const breakdown = {};

  const wantUp = optionType === 'CE'; // a CALL wins on an UP move, a PUT on DOWN
  const dirSign = wantUp ? 1 : -1;

  // 1. Directional conviction (0-40) — how strongly the underlying signal backs THIS side.
  //    A signal in the wrong direction for this side scores ~0 (you don't buy a call into a
  //    bearish read). Magnitude scaled from the quant score.
  const alignedScore = directionalScore * dirSign; // positive when the signal favors this side
  const dirConviction = Math.max(0, Math.min(40, (alignedScore / 10) * 40));
  breakdown.directionalConviction = round1(dirConviction);
  if (alignedScore <= 0) reasons.push(`underlying signal does not favor a ${optionType}`);

  // 2. Regime alignment (0-20) — a tradeable regime whose bias matches this side is the
  //    single biggest "should we even be here" factor. Non-tradeable regime = heavy zero.
  let regimeScore = 0;
  if (!regime?.tradeable) {
    reasons.push('market regime not tradeable');
  } else if ((regime.bias === 'UP' && wantUp) || (regime.bias === 'DOWN' && !wantUp)) {
    regimeScore = 20;
    reasons.push(`regime (${regime.bias}) aligns with ${optionType}`);
  } else if (regime.bias === 'NONE') {
    regimeScore = 8; // tradeable but directionless — mild
  } else {
    reasons.push(`regime (${regime.bias}) opposes ${optionType}`);
  }
  breakdown.regimeAlignment = regimeScore;

  // 3. Greeks favorability (0-20) — sweet-spot delta (0.35-0.65 magnitude: real directional
  //    exposure without deep-ITM cost or far-OTM lottery odds) and theta drag that isn't
  //    punishing relative to the premium.
  let greekScore = 10; // neutral when greeks unavailable
  if (greeks && Number.isFinite(greeks.delta)) {
    const absDelta = Math.abs(greeks.delta);
    // triangular preference peaking at 0.5
    const deltaFit = 1 - Math.min(1, Math.abs(absDelta - 0.5) / 0.5);
    let g = deltaFit * 12;
    // theta drag: |theta|/premium per day — <2% great, >8% poor.
    if (Number.isFinite(greeks.theta) && premium > 0) {
      const thetaPct = (Math.abs(greeks.theta) / premium) * 100;
      g += Math.max(0, 8 * (1 - Math.min(thetaPct, 8) / 8));
      if (thetaPct > 6) reasons.push(`heavy time decay (~${thetaPct.toFixed(1)}%/day)`);
    } else {
      g += 4;
    }
    greekScore = g;
  }
  breakdown.greeks = round1(greekScore);

  // 4. Liquidity (0-12) — from the chain quote data when available, else neutral half.
  let liqScore = 6;
  if (liquidity && Number.isFinite(liquidity.score)) {
    liqScore = (liquidity.score / 100) * 12;
    if (liquidity.score < 40) reasons.push('thin liquidity');
  }
  breakdown.liquidity = round1(liqScore);

  // 5. Positioning bonus (0-8) — PCR alignment when chain intel is live, else neutral.
  let posScore = 4;
  if (chainIntel?.available && Number.isFinite(chainIntel.pcr)) {
    // High PCR (put-heavy) is supportive of upside; low PCR of downside — mild lean.
    const supportsUp = chainIntel.pcr > 1.1;
    const supportsDown = chainIntel.pcr < 0.9;
    if ((wantUp && supportsUp) || (!wantUp && supportsDown)) posScore = 8;
    else if ((wantUp && supportsDown) || (!wantUp && supportsUp)) posScore = 1;
  }
  breakdown.positioning = round1(posScore);

  // Intraday timing penalty — a fresh entry in the closing phase has little runway and
  // fights accelerating theta.
  let raw = dirConviction + regimeScore + greekScore + liqScore + posScore;
  if (sessionPhase === 'closing') {
    raw *= 0.7;
    reasons.push('closing phase — reduced runway');
  }

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, breakdown, reasons };
}

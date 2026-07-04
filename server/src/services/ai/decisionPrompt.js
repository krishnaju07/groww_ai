/** Structured-output JSON schema Claude must satisfy for a trade decision. */
export const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['BUY', 'SELL', 'WAIT'] },
    quantity: { type: 'integer' },
    stopLoss: { type: 'number' },
    target: { type: 'number' },
    reason: { type: 'string' },
    confidence: { type: 'integer' },
  },
  required: ['action', 'quantity', 'stopLoss', 'target', 'reason', 'confidence'],
};

export function buildSystemPrompt() {
  return [
    'You are a disciplined intraday analyst for Indian equity (NSE) markets.',
    'You are advisory only — the platform has its own Risk Manager with final veto power over position',
    'sizing and whether a trade is allowed at all, so do not self-limit for risk reasons; focus purely on',
    'the technical/market read.',
    'Given the indicator snapshot for one symbol, decide BUY, SELL, or WAIT.',
    'quantity is your suggested share count assuming a moderate ~₹5000 position for a BUY/SELL (0 for WAIT).',
    'stopLoss and target are absolute prices. reason is one concise sentence citing the specific signals that',
    'drove the call (RSI, MACD, volume, trend, support/resistance, Nifty sentiment). confidence is 0-100.',
  ].join(' ');
}

export function buildUserContent(symbol, ctx) {
  return [
    `Symbol: ${symbol}`,
    `Current Price (LTP): ₹${ctx.ltp}`,
    `RSI(14): ${ctx.rsi}`,
    `MACD: macd=${ctx.macd.macd} signal=${ctx.macd.signal} histogram=${ctx.macd.histogram}`,
    `Volume vs 20-period average: ${ctx.volumeRatio}x`,
    `Short-term trend: ${ctx.trend}`,
    `Support: ₹${ctx.levels.support} | Resistance: ₹${ctx.levels.resistance}`,
    ctx.niftySentiment,
    '',
    'Decision: BUY, SELL, or WAIT?',
  ].join('\n');
}

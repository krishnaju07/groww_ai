import 'dotenv/config';
import { z } from 'zod';

const boolStr = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? String(def)).toLowerCase() === 'true');

const Schema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/groww_ai'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  MARKET_DATA_PROVIDER: z.enum(['yahoo', 'groww', 'mock']).default('yahoo'),

  GROWW_ACCESS_TOKEN: z.string().optional().default(''),
  GROWW_API_KEY: z.string().optional().default(''),
  GROWW_API_SECRET: z.string().optional().default(''),
  GROWW_TOTP_SECRET: z.string().optional().default(''),

  IGNORE_MARKET_HOURS: boolStr(true),
  AUTO_TRADING_ENABLED: boolStr(true),

  ENABLE_LIVE_TRADING: boolStr(false),
  ENABLE_LIVE_AUTO_TRADING: boolStr(false),
  LIVE_MAX_ORDER_VALUE: z.coerce.number().default(5000),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().default('claude-opus-4-8'),
  AI_LLM_ENABLED: boolStr(true),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-5.4-mini'),

  // Gemini, Grok, and Perplexity are all called through the OpenAI SDK pointed at each
  // provider's own OpenAI-compatible endpoint (see decisionEngine.js's
  // makeOpenAICompatProvider) — no extra SDK dependency needed for any of them.
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  GROK_API_KEY: z.string().optional().default(''),
  GROK_MODEL: z.string().default('grok-4.3'),

  PERPLEXITY_API_KEY: z.string().optional().default(''),
  PERPLEXITY_MODEL: z.string().default('sonar-pro'),

  AI_SCAN_INTERVAL_MINUTES: z.coerce.number().positive().default(5),

  // How fresh a headline must be to feed the AI decision engine, and how many to pull
  // per stock — see newsService.js. Both live-editable from Settings without a restart.
  NEWS_MAX_AGE_HOURS: z.coerce.number().positive().default(24),
  NEWS_HEADLINE_COUNT: z.coerce.number().int().positive().default(3),

  // Auto-trading time-of-day discipline (the AI "owns timing") — all live-editable from
  // Settings. These gate the unattended auto-trading loop only; a deliberate manual order
  // is never blocked by them. See marketHours.getAutoTradeWindowStatus + autoTradingService.
  AVOID_FIRST_MINUTES: z.coerce.number().min(0).default(15), // no fresh auto-entries in the first N min after 9:15 (erratic open)
  SKIP_LUNCH_HOUR: boolStr(false), // skip the 12:00-13:00 low-liquidity lunch window
  STOP_NEW_TRADES_AFTER: z.string().default('14:45'), // 'HH:MM' IST — no fresh auto-entries after this (little runway before 15:15 square-off)
  AVOID_EXPIRY_DAY: boolStr(false), // skip options auto-entries on the underlying's weekly-expiry day (whippy)

  // Market-regime gate — when on, fresh auto-entries are blocked unless the broad-market
  // (NIFTY) regime is classified as tradeable (see regimeService.js). Default on: the
  // vision's "classify before trading, sit out choppy markets" discipline.
  REGIME_FILTER_ENABLED: boolStr(true),

  // Minimum options Opportunity Score (0-100) a setup must clear before the auto-trader
  // spends an LLM call / considers the trade (cost-minimization + quality bar). See
  // opportunityScore.js. Lower = more trades + more API spend; higher = pickier.
  OPPORTUNITY_SCORE_THRESHOLD: z.coerce.number().min(0).max(100).default(55),

  // AI Consensus Engine (consensusService.js). When OFF, auto-trading confirms with the
  // single configured aiProvider (cheaper). When ON, it polls EVERY configured LLM and
  // requires CONSENSUS_MIN_AGREE of them to back Quant's direction — costlier, higher
  // conviction. Off by default (opt into the extra API spend deliberately).
  CONSENSUS_ENABLED: boolStr(false),
  CONSENSUS_MIN_AGREE: z.coerce.number().int().min(1).default(2),

  // Learned-edge / expected-value gate (learnedEdgeService.js) — vetoes fresh entries on
  // setups the AI's own history proves it loses on (regime/side/hour). On by default: it
  // only ever activates once a real losing track record exists on ≥ LEARNING_MIN_SAMPLE
  // trades, so it's inert (safe) on a fresh account and grows teeth as history accrues.
  LEARNING_GATE_ENABLED: boolStr(true),
  LEARNING_MIN_SAMPLE: z.coerce.number().int().min(2).default(5),
});

const parsed = Schema.safeParse(process.env);

// Never throw at boot — fall back to schema defaults so the app can still run
// (paper-only, mock data) even with a missing/incomplete .env.
export const env = parsed.success ? parsed.data : Schema.parse({});

if (!parsed.success) {
  console.warn('[env] Invalid environment variables, falling back to defaults:', parsed.error.flatten().fieldErrors);
}

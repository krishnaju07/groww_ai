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
  OPENAI_MODEL: z.string().default('gpt-4o'),

  AI_SCAN_INTERVAL_MINUTES: z.coerce.number().positive().default(5),
});

const parsed = Schema.safeParse(process.env);

// Never throw at boot — fall back to schema defaults so the app can still run
// (paper-only, mock data) even with a missing/incomplete .env.
export const env = parsed.success ? parsed.data : Schema.parse({});

if (!parsed.success) {
  console.warn('[env] Invalid environment variables, falling back to defaults:', parsed.error.flatten().fieldErrors);
}

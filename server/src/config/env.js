import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Coerce a "true"/"false" string (any case) into a boolean.
 * Defaults to `true` when the value is undefined/empty so booleans never throw.
 */
const boolFromString = (defaultValue) =>
  z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (v === undefined || v === '') return defaultValue;
      return String(v).trim().toLowerCase() === 'true';
    });

const envSchema = z.object({
  PORT: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(v ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : 4000;
    }),
  MONGODB_URI: z.string().optional().default('mongodb://localhost:27017/groww_ai'),
  CLIENT_ORIGIN: z.string().optional().default('http://localhost:5173'),
  MARKET_DATA_PROVIDER: z
    .enum(['yahoo', 'groww', 'alphavantage', 'mock'])
    .optional()
    .default('yahoo'),
  ALPHA_VANTAGE_API_KEY: z.string().optional().default(''),
  GROWW_ACCESS_TOKEN: z.string().optional().default(''),
  GROWW_API_KEY: z.string().optional().default(''),
  GROWW_API_SECRET: z.string().optional().default(''),
  GROWW_TOTP_SECRET: z.string().optional().default(''),
  IGNORE_MARKET_HOURS: boolFromString(true),
  AUTO_TRADING_ENABLED: boolFromString(true),
  ENABLE_LIVE_TRADING: boolFromString(false),
  ENABLE_LIVE_AUTO_TRADING: boolFromString(false),
  // Hard per-order value cap (₹) for LIVE orders — limits blast radius if AI
  // trading is armed. Applies to every live BUY (manual or automatic).
  LIVE_MAX_ORDER_VALUE: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 5000;
    }),
  // Opt-in: arm a native Groww GTT stop-loss right after each live BUY so an
  // AI-opened real position is never left without a stop. Default OFF.
  LIVE_ARM_GTT_STOPLOSS: boolFromString(false),
  // AI model (LLM reasoning layer). When ANTHROPIC_API_KEY is empty or
  // AI_LLM_ENABLED=false, the signal engine transparently falls back to the
  // deterministic quant model — so the app always works without a key.
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default('claude-opus-4-8'),
  AI_LLM_ENABLED: boolFromString(true),
});

const parsed = envSchema.safeParse(process.env);

/**
 * Frozen, validated environment object. Importing this module never throws:
 * every variable has a default, and an invalid MARKET_DATA_PROVIDER falls back
 * to a fully-defaulted config rather than crashing on boot.
 * @type {Readonly<{
 *   PORT: number,
 *   MONGODB_URI: string,
 *   CLIENT_ORIGIN: string,
 *   MARKET_DATA_PROVIDER: ('yahoo'|'groww'|'alphavantage'|'mock'),
 *   ALPHA_VANTAGE_API_KEY: string,
 *   GROWW_ACCESS_TOKEN: string,
 *   GROWW_API_KEY: string,
 *   GROWW_API_SECRET: string,
 *   GROWW_TOTP_SECRET: string,
 *   IGNORE_MARKET_HOURS: boolean,
 *   AUTO_TRADING_ENABLED: boolean,
 *   ENABLE_LIVE_TRADING: boolean,
 *   ENABLE_LIVE_AUTO_TRADING: boolean,
 *   LIVE_MAX_ORDER_VALUE: number,
 *   LIVE_ARM_GTT_STOPLOSS: boolean,
 *   ANTHROPIC_API_KEY: string,
 *   AI_MODEL: string,
 *   AI_LLM_ENABLED: boolean,
 * }>}
 */
export const env = Object.freeze(
  parsed.success
    ? parsed.data
    : {
        PORT: 4000,
        MONGODB_URI: 'mongodb://localhost:27017/groww_ai',
        CLIENT_ORIGIN: 'http://localhost:5173',
        MARKET_DATA_PROVIDER: 'yahoo',
        ALPHA_VANTAGE_API_KEY: '',
        GROWW_ACCESS_TOKEN: '',
        GROWW_API_KEY: '',
        GROWW_API_SECRET: '',
        GROWW_TOTP_SECRET: '',
        IGNORE_MARKET_HOURS: true,
        AUTO_TRADING_ENABLED: true,
        ENABLE_LIVE_TRADING: false,
        ENABLE_LIVE_AUTO_TRADING: false,
        LIVE_MAX_ORDER_VALUE: 5000,
        LIVE_ARM_GTT_STOPLOSS: false,
        ANTHROPIC_API_KEY: '',
        AI_MODEL: 'claude-opus-4-8',
        AI_LLM_ENABLED: true,
      },
);

if (!parsed.success) {
  console.warn('[env] Validation issues, using safe defaults:', parsed.error.flatten().fieldErrors);
}

export default env;

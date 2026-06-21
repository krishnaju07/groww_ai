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
  IGNORE_MARKET_HOURS: boolFromString(true),
  AUTO_TRADING_ENABLED: boolFromString(true),
  ENABLE_LIVE_TRADING: boolFromString(false),
  ENABLE_LIVE_AUTO_TRADING: boolFromString(false),
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
 *   IGNORE_MARKET_HOURS: boolean,
 *   AUTO_TRADING_ENABLED: boolean,
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
        IGNORE_MARKET_HOURS: true,
        AUTO_TRADING_ENABLED: true,
        ENABLE_LIVE_TRADING: false,
        ENABLE_LIVE_AUTO_TRADING: false,
      },
);

if (!parsed.success) {
  console.warn('[env] Validation issues, using safe defaults:', parsed.error.flatten().fieldErrors);
}

export default env;

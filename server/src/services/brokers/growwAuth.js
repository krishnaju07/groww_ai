/**
 * Resolves a Groww Trade API access token, shared by GrowwProvider (market data)
 * and GrowwBroker (order execution). Three supported auth modes, checked in order:
 *   1. GROWW_ACCESS_TOKEN — a static token, used verbatim (simplest, dev-friendly).
 *   2. GROWW_API_KEY + GROWW_API_SECRET — "approval" flow (SHA-256 checksum of secret+timestamp).
 *   3. GROWW_API_KEY + GROWW_TOTP_SECRET — "totp" flow (used only if no API_SECRET is set).
 * Per https://groww.in/trade-api/docs/curl, both flows call POST /v1/token/api/access
 * with `Authorization: Bearer <GROWW_API_KEY>` (the API key itself bootstraps the
 * token-generation call) and return `{token, expiry, ...}` directly (no envelope).
 * Tokens are cached in-process and refreshed once they're within 5 minutes of expiry
 * (Groww tokens are valid ~24h, rotating daily around 06:00 IST).
 */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { GROWW_BASE_URL } from '../../config/constants.js';
import { totpCode } from '../../utils/totp.js';

let cached = { token: null, expiresAt: 0 };

/** @returns {boolean} */
export function hasGrowwCredentials() {
  return Boolean(env.GROWW_ACCESS_TOKEN || (env.GROWW_API_KEY && (env.GROWW_API_SECRET || env.GROWW_TOTP_SECRET)));
}

async function requestToken(body) {
  const res = await fetch(`${GROWW_BASE_URL}/token/api/access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROWW_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.token) {
    const msg = json?.error?.errorMessage || json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new Error(`Groww token generation failed: ${msg}`);
  }
  return json;
}

async function generateToken() {
  if (env.GROWW_API_SECRET) {
    const timestamp = String(Math.floor(Date.now() / 1000)); // epoch SECONDS, valid 10 min
    const checksum = crypto.createHash('sha256').update(`${env.GROWW_API_SECRET}${timestamp}`).digest('hex');
    return requestToken({ key_type: 'approval', checksum, timestamp });
  }

  const otp = totpCode(env.GROWW_TOTP_SECRET);
  return requestToken({ key_type: 'totp', totp: otp });
}

/** @returns {Promise<string>} */
export async function getAccessToken() {
  if (env.GROWW_ACCESS_TOKEN) return env.GROWW_ACCESS_TOKEN;

  if (!env.GROWW_API_KEY || (!env.GROWW_API_SECRET && !env.GROWW_TOTP_SECRET)) {
    const e = new Error('No Groww credentials configured.');
    e.code = 'NO_BROKER_CREDENTIALS';
    throw e;
  }

  if (cached.token && Date.now() < cached.expiresAt - 5 * 60 * 1000) return cached.token;

  const payload = await generateToken();
  cached = {
    token: payload.token,
    expiresAt: payload.expiry ? new Date(payload.expiry).getTime() : Date.now() + 23 * 60 * 60 * 1000,
  };
  return cached.token;
}

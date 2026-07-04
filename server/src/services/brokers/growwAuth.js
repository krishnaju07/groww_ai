/**
 * Resolves a Groww Trade API access token, shared by GrowwProvider (market data)
 * and GrowwBroker (order execution). Three supported auth modes, checked in order:
 *   1. GROWW_ACCESS_TOKEN — a static token, used verbatim (simplest, dev-friendly).
 *   2. GROWW_API_KEY + GROWW_API_SECRET — "approval" flow (SHA-256 checksum of key+secret+timestamp).
 *   3. GROWW_API_KEY + GROWW_TOTP_SECRET — "totp" flow (used only if no API_SECRET is set).
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

async function generateToken() {
  if (env.GROWW_API_SECRET) {
    const timestamp = String(Date.now());
    const checksumInput = `${env.GROWW_API_KEY}${env.GROWW_API_SECRET}${timestamp}`;
    const checksum = crypto.createHash('sha256').update(checksumInput).digest('hex');
    const res = await fetch(`${GROWW_BASE_URL}/token/api/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_type: 'approval', checksum, timestamp }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.status !== 'SUCCESS') {
      throw new Error(`Groww token generation failed: ${json?.error?.message || `HTTP ${res.status}`}`);
    }
    return json.payload;
  }

  const otp = totpCode(env.GROWW_TOTP_SECRET);
  const res = await fetch(`${GROWW_BASE_URL}/token/api/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_type: 'totp', totp: otp }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status !== 'SUCCESS') {
    throw new Error(`Groww token generation failed: ${json?.error?.message || `HTTP ${res.status}`}`);
  }
  return json.payload;
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

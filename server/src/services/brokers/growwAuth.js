/**
 * Groww access-token provider.
 *
 * The Groww Trade API access token expires daily at ~6:00 AM IST. This module
 * provides a always-valid token to the broker, in priority order:
 *   1. A static GROWW_ACCESS_TOKEN (manual / dev) — used verbatim.
 *   2. Auto-generated daily token via POST /v1/token/api/access using either:
 *        - API key + secret  (key_type "approval", SHA-256 checksum), or
 *        - API key + TOTP    (key_type "totp", RFC 6238 code from a base32 secret).
 *      The generated token is cached until shortly before its expiry.
 *
 * Docs: https://groww.in/trade-api/docs/curl  (Authentication).
 * No external deps — checksum + TOTP are built on node:crypto.
 */

import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { GROWW_BASE_URL, GROWW_API_VERSION } from '../../config/constants.js';

/** @type {{ token: string, expiresAt: number }|null} */
let cached = null;

/** Whether API key + (secret | TOTP secret) are present to auto-generate a token. */
export function hasGeneratableCreds() {
  return Boolean(env.GROWW_API_KEY && (env.GROWW_API_SECRET || env.GROWW_TOTP_SECRET));
}

/** Whether ANY usable Groww credential is configured (static token or generatable). */
export function hasGrowwCredentials() {
  return Boolean(env.GROWW_ACCESS_TOKEN) || hasGeneratableCreds();
}

/**
 * SHA-256 checksum of (apiSecret + epochSeconds), per the Groww approval flow.
 * @param {string} secret
 * @param {string} timestamp  epoch seconds as a string
 * @returns {string} hex digest
 */
function makeChecksum(secret, timestamp) {
  return crypto.createHash('sha256').update(secret + timestamp).digest('hex');
}

/**
 * Decode an RFC 4648 base32 string to bytes (for TOTP secrets).
 * @param {string} input
 * @returns {Buffer}
 */
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Generate a 6-digit RFC 6238 TOTP code (SHA-1, 30s step) from a base32 secret.
 * @param {string} base32Secret
 * @returns {string} 6-digit code
 */
function totp(base32Secret) {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Call POST /v1/token/api/access and return the token + parsed expiry.
 * Prefers the approval (api secret) flow; falls back to TOTP when only a TOTP
 * secret is configured.
 * @returns {Promise<{ token: string, expiresAt: number }>}
 */
async function generateToken() {
  const useTotp = !env.GROWW_API_SECRET && Boolean(env.GROWW_TOTP_SECRET);
  const body = useTotp
    ? { key_type: 'totp', totp: totp(env.GROWW_TOTP_SECRET) }
    : (() => {
        const ts = Math.floor(Date.now() / 1000).toString();
        return { key_type: 'approval', checksum: makeChecksum(env.GROWW_API_SECRET, ts), timestamp: ts };
      })();

  const res = await fetch(`${GROWW_BASE_URL}/token/api/access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${env.GROWW_API_KEY}`,
      'X-API-VERSION': GROWW_API_VERSION,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.status === 'FAILURE' || !json?.token) {
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    const err = new Error(`Groww token generation failed: ${msg}`);
    err.code = 'BROKER_AUTH_ERROR';
    throw err;
  }

  const parsed = json.expiry ? Date.parse(json.expiry) : NaN;
  // Fall back to ~6h if expiry is missing/unparseable (token rotates daily ~6 AM).
  const expiresAt = Number.isFinite(parsed) ? parsed : Date.now() + 6 * 60 * 60 * 1000;
  return { token: json.token, expiresAt };
}

/**
 * Return a valid Groww access token, generating + caching one when needed.
 * @returns {Promise<string>}
 * @throws {Error} when no credentials are configured or generation fails
 */
export async function getAccessToken() {
  if (env.GROWW_ACCESS_TOKEN) return env.GROWW_ACCESS_TOKEN;

  if (!hasGeneratableCreds()) {
    const err = new Error(
      'No Groww credentials: set GROWW_ACCESS_TOKEN, or GROWW_API_KEY + (GROWW_API_SECRET | GROWW_TOTP_SECRET).',
    );
    err.code = 'BROKER_AUTH_ERROR';
    throw err;
  }

  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  cached = await generateToken();
  console.log(`[growwAuth] generated access token (expires ${new Date(cached.expiresAt).toISOString()})`);
  return cached.token;
}

/** Clear the cached token (e.g. after an auth error) so the next call regenerates. */
export function clearTokenCache() {
  cached = null;
}

export default { getAccessToken, hasGeneratableCreds, hasGrowwCredentials, clearTokenCache };

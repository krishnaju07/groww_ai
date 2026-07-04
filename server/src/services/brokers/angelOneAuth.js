/**
 * Manages an Angel One Smart API session per user. Credentials (apiKey,
 * clientCode, password, totpSecret) come from credentialStore — entered once
 * via the Brokers page, re-used until the session expires (Angel One sessions
 * are valid for the trading day; re-authenticate via the "Reconnect" button).
 */
import { SmartAPI } from 'smartapi-javascript';
import { getCredential } from './credentialStore.js';
import { totpCode } from '../../utils/totp.js';

const sessions = new Map(); // userId -> { client: SmartAPI, expiresAt: number }
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // conservative — Angel One sessions last a trading day

/** @param {string} userId @returns {Promise<SmartAPI>} */
export async function getAngelOneClient(userId) {
  const existing = sessions.get(userId);
  if (existing && Date.now() < existing.expiresAt) return existing.client;

  const creds = await getCredential(userId, 'angelone');
  if (!creds?.apiKey || !creds?.clientCode || !creds?.password || !creds?.totpSecret) {
    const e = new Error('No Angel One credentials configured. Connect Angel One from the Brokers page.');
    e.code = 'NO_BROKER_CREDENTIALS';
    throw e;
  }

  const client = new SmartAPI({ api_key: creds.apiKey });
  await client.generateSession(creds.clientCode, creds.password, totpCode(creds.totpSecret));

  sessions.set(userId, { client, expiresAt: Date.now() + SESSION_TTL_MS });
  return client;
}

/** @param {string} userId @returns {boolean} */
export function isAngelOneSessionActive(userId) {
  const existing = sessions.get(userId);
  return Boolean(existing && Date.now() < existing.expiresAt);
}

/** @param {string} userId */
export function clearAngelOneSession(userId) {
  sessions.delete(userId);
}

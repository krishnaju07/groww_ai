/**
 * Zerodha Kite Connect requires a manual browser login once per trading day
 * (redirect → login → `request_token` → exchange for `access_token`). There is
 * no headless refresh. `getLoginUrl`/`completeLogin` back the Brokers page's
 * "Reconnect" button; `getZerodhaClient` resolves the stored access_token for
 * every other call.
 */
import { KiteConnect } from 'kiteconnect';
import { env } from '../../config/env.js';
import { getCredential, saveCredential } from './credentialStore.js';

const clients = new Map(); // userId -> KiteConnect (access_token set)

function nextGrowwLikeExpiry() {
  // Kite access tokens expire ~7:30 AM IST the next day — use a same-shape
  // "next day 6 AM local" conservative expiry so a stale token is caught early.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

/** @returns {string} URL to redirect the user's browser to for the daily login. */
export function getLoginUrl() {
  if (!env.ZERODHA_API_KEY) {
    const e = new Error('ZERODHA_API_KEY is not configured.');
    e.code = 'NO_BROKER_CREDENTIALS';
    throw e;
  }
  const kc = new KiteConnect({ api_key: env.ZERODHA_API_KEY });
  return kc.getLoginURL();
}

/** @param {string} userId @param {string} requestToken @returns {Promise<void>} */
export async function completeLogin(userId, requestToken) {
  const kc = new KiteConnect({ api_key: env.ZERODHA_API_KEY });
  const session = await kc.generateSession(requestToken, env.ZERODHA_API_SECRET);
  await saveCredential(userId, 'zerodha', { accessToken: session.access_token }, nextGrowwLikeExpiry());
  clients.delete(userId);
}

/** @param {string} userId @returns {Promise<import('kiteconnect').Connect>} */
export async function getZerodhaClient(userId) {
  if (clients.has(userId)) return clients.get(userId);

  const creds = await getCredential(userId, 'zerodha');
  if (!creds?.accessToken) {
    const e = new Error('No Zerodha session — click Reconnect on the Brokers page.');
    e.code = 'NO_BROKER_CREDENTIALS';
    throw e;
  }

  const kc = new KiteConnect({ api_key: env.ZERODHA_API_KEY });
  kc.setAccessToken(creds.accessToken);
  clients.set(userId, kc);
  return kc;
}

/** @param {string} userId */
export function clearZerodhaSession(userId) {
  clients.delete(userId);
}

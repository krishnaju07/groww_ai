/**
 * Encrypts/decrypts broker credentials (API keys, tokens, sessions) at rest using
 * AES-256-GCM. `credentialStore` is the ONLY module that ever sees plaintext —
 * everything else (routes, adapters) works with a redacted status object or asks
 * this module to decrypt just-in-time for a single broker call.
 */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { BrokerCredential } from '../../models/BrokerCredential.js';

function getKey() {
  if (!env.BROKER_CREDENTIAL_KEY) {
    const e = new Error('BROKER_CREDENTIAL_KEY is not configured — cannot store/read broker credentials.');
    e.code = 'NO_CREDENTIAL_KEY';
    throw e;
  }
  const key = Buffer.from(env.BROKER_CREDENTIAL_KEY, 'base64');
  if (key.length !== 32) {
    const e = new Error('BROKER_CREDENTIAL_KEY must decode to 32 bytes (base64).');
    e.code = 'BAD_CREDENTIAL_KEY';
    throw e;
  }
  return key;
}

function encrypt(plaintextObj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(record) {
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.encryptedPayload, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * @param {string} userId
 * @param {string} broker
 * @param {Record<string, any>} payload  arbitrary credential fields for this broker
 * @param {Date} [expiresAt]
 */
export async function saveCredential(userId, broker, payload, expiresAt = null) {
  const { encryptedPayload, iv, authTag } = encrypt(payload);
  await BrokerCredential.findOneAndUpdate(
    { userId, broker },
    { encryptedPayload, iv, authTag, lastConnectedAt: new Date(), expiresAt },
    { upsert: true },
  );
}

/** @param {string} userId @param {string} broker @returns {Promise<Record<string, any>|null>} */
export async function getCredential(userId, broker) {
  const record = await BrokerCredential.findOne({ userId, broker }).lean();
  if (!record) return null;
  return decrypt(record);
}

/** @param {string} userId @param {string} broker @returns {Promise<boolean>} */
export async function hasValidCredential(userId, broker) {
  const record = await BrokerCredential.findOne({ userId, broker }).lean();
  if (!record) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) return false;
  return true;
}

/** @param {string} userId @param {string} broker */
export async function clearCredential(userId, broker) {
  await BrokerCredential.deleteOne({ userId, broker });
}

/** @param {string} userId @param {string} broker */
export async function touchValidated(userId, broker) {
  await BrokerCredential.updateOne({ userId, broker }, { lastValidatedAt: new Date() });
}

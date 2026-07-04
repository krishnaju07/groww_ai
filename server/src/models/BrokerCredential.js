import mongoose from 'mongoose';
import { BROKERS } from '../config/constants.js';

/**
 * Encrypted broker credential/session store. `encryptedPayload`/`iv`/`authTag` are
 * produced by services/brokers/credentialStore.js (AES-256-GCM) — no plaintext
 * secret is ever persisted here or logged.
 */
const BrokerCredentialSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    broker: { type: String, enum: BROKERS, required: true },
    encryptedPayload: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    lastConnectedAt: { type: Date, default: null },
    lastValidatedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

BrokerCredentialSchema.index({ userId: 1, broker: 1 }, { unique: true });

export const BrokerCredential =
  mongoose.models.BrokerCredential || mongoose.model('BrokerCredential', BrokerCredentialSchema);

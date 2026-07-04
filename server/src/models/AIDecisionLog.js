import mongoose from 'mongoose';
import { AI_ACTIONS } from '../config/constants.js';

/** Every AI decision call — including WAIT — for a full audit trail. */
const AIDecisionLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    symbol: { type: String, required: true },
    action: { type: String, enum: AI_ACTIONS, required: true },
    quantity: { type: Number, default: 0 },
    stopLoss: { type: Number, default: null },
    target: { type: Number, default: null },
    reason: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    models: [
      {
        name: { type: String },
        action: { type: String },
        confidence: { type: Number },
      },
    ],
    indicatorsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    riskResult: {
      allowed: { type: Boolean, default: null },
      reason: { type: String, default: '' },
    },
    resultingOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  { timestamps: true },
);

AIDecisionLogSchema.index({ userId: 1, createdAt: -1 });
AIDecisionLogSchema.index({ symbol: 1, createdAt: -1 });

export const AIDecisionLog =
  mongoose.models.AIDecisionLog || mongoose.model('AIDecisionLog', AIDecisionLogSchema);

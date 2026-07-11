import mongoose from 'mongoose';
import { AI_ACTIONS, OPTION_TYPES } from '../config/constants.js';

/** Every AI decision call — including WAIT — for a full audit trail. */
const AIDecisionLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    symbol: { type: String, required: true },
    // Populated only for options decisions (decisionEngine.decideOptions) — same
    // fields as Order/Position/Trade, for consistent auditing/display.
    segment: { type: String, enum: ['CASH', 'FNO'], default: 'CASH' },
    underlying: { type: String, default: null },
    strike: { type: Number, default: null },
    expiry: { type: Date, default: null },
    optionType: { type: String, enum: [...OPTION_TYPES, null], default: null },
    lotSize: { type: Number, default: null },
    action: { type: String, enum: AI_ACTIONS, required: true },
    quantity: { type: Number, default: 0 },
    stopLoss: { type: Number, default: null },
    target: { type: Number, default: null },
    reason: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    // Only populated by the LLM path (Claude/OpenAI) — the Quant cross-check has no
    // news/track-record input and doesn't produce these.
    justification: { type: String, default: '' },
    scoreBreakdown: {
      trendConfluence: { type: Number },
      momentum: { type: Number },
      volumeConviction: { type: Number },
      newsSentiment: { type: Number },
      trackRecord: { type: Number },
    },
    models: [
      {
        name: { type: String },
        // The exact model id used for this LLM entry (e.g. 'sonar-pro') — absent for
        // the 'Quant' entry, which isn't an LLM call. Lets past decisions be audited
        // for cost (which model was actually spending money) after the fact.
        model: { type: String },
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

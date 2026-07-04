import mongoose from 'mongoose';

const RISK_EVENT_TYPES = ['BLOCK', 'ALLOW', 'KILL_SWITCH_TRIP', 'KILL_SWITCH_RESET'];

/** Audit trail: every canTrade() decision + every kill-switch action. */
const RiskEventSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    type: { type: String, enum: RISK_EVENT_TYPES, required: true },
    reason: { type: String, default: '' },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

RiskEventSchema.index({ userId: 1, createdAt: -1 });

export const RiskEvent = mongoose.models.RiskEvent || mongoose.model('RiskEvent', RiskEventSchema);

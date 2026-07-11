import mongoose from 'mongoose';

/**
 * The AI's review of its OWN closed trade — "was entry too early, exit too late, stop too
 * wide, could another choice have been better?" (the user's self-critique requirement).
 * Generated deterministically at trade close (no LLM cost) so every AI trade gets one, and
 * surfaced in Reports to make the AI's mistakes and wins legible over time.
 */
const TradeCritiqueSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true },
    aiDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIDecisionLog', default: null },
    symbol: { type: String, required: true },
    segment: { type: String, default: 'CASH' },
    pnl: { type: Number, required: true },
    outcome: { type: String, enum: ['WIN', 'LOSS', 'FLAT'], required: true },
    exitType: { type: String, default: 'OTHER' }, // TARGET | STOP | TRAIL | PARTIAL | TIME | SQUAREOFF | MANUAL | OTHER
    // Overall judgment of the AI's own conduct on this trade (independent of win/loss —
    // a disciplined stop-out is ACCEPTABLE, a loss beyond the planned stop is a MISTAKE).
    verdict: { type: String, enum: ['GOOD_TRADE', 'ACCEPTABLE', 'MISTAKE'], required: true },
    lessons: { type: [String], default: [] },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

TradeCritiqueSchema.index({ userId: 1, createdAt: -1 });

export const TradeCritique = mongoose.models.TradeCritique || mongoose.model('TradeCritique', TradeCritiqueSchema);

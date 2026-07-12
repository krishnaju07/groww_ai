import mongoose from 'mongoose';

/**
 * A persisted record of every auto-trading tick's decisions — including the ones that
 * DIDN'T become an order (skipped for low confidence, negative learned edge, low
 * opportunity score, trading-window/regime gate, no ensemble agreement, etc). Before this
 * model, every one of those reasons only ever hit the server console (autoTradingJob.js),
 * so there was no way to see what the auto-trader actually considered and why it stood
 * aside without watching the terminal at the exact moment it happened.
 *
 * Short-lived by design (TTL below) — this is a "what just happened" feed, not a
 * long-term analytics source (that's Trade + AIDecisionLog, see analyticsService.js).
 */
const AutoTradeActivitySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  tickAt: { type: Date, default: Date.now },
  symbol: { type: String, required: true },
  segment: { type: String, enum: ['CASH', 'FNO'], default: 'CASH' },
  action: { type: String, default: null }, // BUY | SELL | null
  status: { type: String, required: true }, // FILLED | BLOCKED | SKIPPED_* | CONTEXT_FETCH_FAILED
  reason: { type: String, default: '' },
  confidence: { type: Number, default: null },
  opportunityScore: { type: Number, default: null },
});

AutoTradeActivitySchema.index({ userId: 1, tickAt: -1 });
// Auto-expire after 14 days — this is a rolling "what did the auto-trader just do" feed,
// not a permanent record (closed Trade + AIDecisionLog already keep the durable history).
AutoTradeActivitySchema.index({ tickAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

export const AutoTradeActivity = mongoose.models.AutoTradeActivity || mongoose.model('AutoTradeActivity', AutoTradeActivitySchema);

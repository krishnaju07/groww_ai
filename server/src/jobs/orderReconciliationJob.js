import cron from 'node-cron';
import { Order } from '../models/Order.js';
import { brokerFor } from '../services/brokers/registry.js';
import { recordLiveFill } from '../services/orderService.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

let running = false;
// Each candidate order is an independent document/broker call (no shared state across
// iterations) — safe to check concurrently. Capped so a backlog of unresolved orders
// doesn't burst-hammer the broker API all at once.
const RECONCILE_CONCURRENCY = 8;
// Only reconcile orders old enough that the inline retry (retryFillCheck.js, inside each
// broker adapter's placeOrder) has already had its full chance to resolve this itself —
// avoids this job and that inline path racing each other on a just-placed order.
const MIN_AGE_MS = 5000;

/**
 * Backstop for a gap the broker adapters' own inline retry (retryFillCheck.js) doesn't
 * fully close: a MARKET order's fill can still take longer than the retry window to
 * show up in the broker's order-status endpoint. When that happens, the order is left
 * with Order.tradeId === null and status PLACED/PENDING — this job re-checks any such
 * live order periodically and backfills the fill (via the same recordLiveFill() the
 * inline path uses) the moment the broker actually reports it. Without this, a fill that
 * raced the inline check was silently NEVER recorded — invisible to the risk manager,
 * never monitored by Position Guardian, never closed by square-off — despite real money
 * having moved. Order.tradeId is the idempotency guard: only ever set once a fill is
 * actually recorded, so this job and the inline path can't double-record the same fill.
 * @returns {Promise<{ran:boolean, results?:object[]}>}
 */
export async function runOrderReconciliationTick() {
  const candidates = await Order.find({
    mode: 'live',
    status: { $in: ['PLACED', 'PENDING'] },
    tradeId: null,
    createdAt: { $lte: new Date(Date.now() - MIN_AGE_MS) },
  });
  if (!candidates.length) return { ran: true, results: [] };

  const outcomes = await mapWithConcurrency(candidates, RECONCILE_CONCURRENCY, async (order) => {
    try {
      const broker = brokerFor(order.broker, order.userId);
      const detail = await broker.getOrderStatus(order.brokerOrderId, order.segment ?? 'CASH');

      if (detail.status === order.status) return null; // still unresolved, try again next tick

      if (detail.status === 'FILLED' && detail.filledPrice) {
        const tradeId = await recordLiveFill(
          order.userId,
          order.broker,
          {
            symbol: order.symbol,
            action: order.action,
            quantity: order.quantity,
            source: order.source,
            segment: order.segment ?? 'CASH',
            underlying: order.underlying,
            strike: order.strike,
            expiry: order.expiry,
            optionType: order.optionType,
            lotSize: order.lotSize,
          },
          detail,
        );
        order.status = 'FILLED';
        if (tradeId) order.tradeId = tradeId;
        await order.save();
        return { orderId: String(order._id), symbol: order.symbol, status: 'FILLED_BACKFILLED' };
      }
      if (['CANCELLED', 'REJECTED'].includes(detail.status)) {
        order.status = detail.status;
        await order.save();
        return { orderId: String(order._id), symbol: order.symbol, status: detail.status };
      }
      // else: still PLACED/PENDING at the broker — genuinely not filled yet, leave as-is.
      return null;
    } catch (err) {
      console.error(`[orderReconciliationJob] failed for order ${order._id}:`, err.message);
      return null;
    }
  });

  return { ran: true, results: outcomes.filter(Boolean) };
}

/** Registers the reconciliation tick — runs every 20s. */
export function startOrderReconciliationJob() {
  cron.schedule('*/20 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const result = await runOrderReconciliationTick();
      if (result.results?.length) {
        console.log(`[orderReconciliationJob] tick: ${JSON.stringify(result.results)}`);
      }
    } catch (err) {
      console.error('[orderReconciliationJob] tick failed:', err);
    } finally {
      running = false;
    }
  });
  console.log('[orderReconciliationJob] scheduled (every 20s)');
}

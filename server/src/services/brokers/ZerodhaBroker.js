/**
 * Zerodha Kite Connect broker adapter. Order/quote calls use `tradingsymbol` +
 * `exchange` directly (no separate instrument-token lookup needed, unlike
 * Angel One). Session comes from zerodhaAuth.js — see that file for the daily
 * login-flow explanation.
 */
import { getZerodhaClient } from './zerodhaAuth.js';

function mapStatus(kiteStatus) {
  const s = String(kiteStatus ?? '').toUpperCase();
  if (s === 'COMPLETE') return 'FILLED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'PLACED';
}

/** @param {string} userId @returns {import('../../types.js').BrokerAdapter} */
export function createZerodhaBroker(userId) {
  return {
    name: 'zerodha',

    async isConnected() {
      try {
        const kc = await getZerodhaClient(userId);
        await kc.getProfile();
        return true;
      } catch {
        return false;
      }
    },

    async connect() {
      await getZerodhaClient(userId);
    },

    /**
     * Every position through this app is intraday (MIS) — never CNC/delivery. CNC would
     * leave the position unmanaged by the broker overnight AND untouched by our own
     * square-off job, i.e. an actual T+1 delivery holding despite this being an
     * "intraday only" platform.
     * @param {import('../../types.js').PlaceOrderInput} o
     */
    async placeOrder(o) {
      const kc = await getZerodhaClient(userId);
      const res = await kc.placeOrder('regular', {
        exchange: 'NSE',
        tradingsymbol: o.symbol,
        transaction_type: o.action,
        quantity: o.quantity,
        product: 'MIS',
        order_type: o.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        validity: 'DAY',
        price: o.orderType === 'LIMIT' ? o.price : undefined,
      });
      const brokerOrderId = res.order_id;

      // MARKET orders on NSE cash equity fill near-instantly — check right away so
      // recordLiveFill (orderService.js) actually gets a filledPrice/filledQuantity
      // instead of always hardcoding PLACED. If it's not reflected yet, we still return
      // whatever we have; the caller already tolerates a non-FILLED result.
      try {
        const detail = await this.getOrderStatus(brokerOrderId);
        return { brokerOrderId, status: detail.status, filledPrice: detail.filledPrice, filledQuantity: detail.filledQuantity };
      } catch {
        return { brokerOrderId, status: 'PLACED' };
      }
    },

    async modifyOrder(orderId, patch) {
      const kc = await getZerodhaClient(userId);
      const res = await kc.modifyOrder('regular', orderId, {
        quantity: patch.quantity,
        price: patch.price,
        order_type: patch.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
      });
      return { brokerOrderId: res.order_id, status: 'PLACED' };
    },

    async cancelOrder(orderId) {
      const kc = await getZerodhaClient(userId);
      const res = await kc.cancelOrder('regular', orderId);
      return { brokerOrderId: res.order_id, status: 'CANCELLED' };
    },

    async getOrderStatus(orderId) {
      const kc = await getZerodhaClient(userId);
      const history = await kc.getOrderHistory(orderId);
      const latest = history.at(-1);
      if (!latest) {
        const e = new Error(`Zerodha order ${orderId} not found.`);
        e.code = 'ORDER_NOT_FOUND';
        e.status = 404;
        throw e;
      }
      return {
        brokerOrderId: orderId,
        status: mapStatus(latest.status),
        filledPrice: latest.average_price || undefined,
        filledQuantity: latest.filled_quantity || undefined,
      };
    },

    async getOrderList() {
      const kc = await getZerodhaClient(userId);
      const orders = await kc.getOrders();
      return orders.map((o) => ({
        brokerOrderId: o.order_id,
        status: mapStatus(o.status),
        symbol: o.tradingsymbol,
        action: o.transaction_type,
        quantity: o.quantity,
        filledPrice: o.average_price || undefined,
        filledQuantity: o.filled_quantity || undefined,
        createdAt: o.order_timestamp ? new Date(o.order_timestamp) : null,
      }));
    },

    async getLTP(symbol) {
      const kc = await getZerodhaClient(userId);
      const quote = await kc.getLTP([`NSE:${symbol}`]);
      const entry = quote[`NSE:${symbol}`];
      if (!entry) throw new Error(`Zerodha LTP ${symbol} → no data`);
      return entry.last_price;
    },

    async getLTPBatch(symbols) {
      const kc = await getZerodhaClient(userId);
      const instruments = symbols.map((s) => `NSE:${s}`);
      const quote = await kc.getLTP(instruments);
      const out = {};
      for (const s of symbols) {
        const entry = quote[`NSE:${s}`];
        if (entry) out[s] = entry.last_price;
      }
      return out;
    },

    async getHoldings() {
      const kc = await getZerodhaClient(userId);
      const holdings = await kc.getHoldings();
      return holdings.map((h) => ({ symbol: h.tradingsymbol, quantity: h.quantity, avgPrice: h.average_price, ltp: h.last_price }));
    },

    async getPositions() {
      const kc = await getZerodhaClient(userId);
      const { net } = await kc.getPositions();
      return net.map((p) => ({ symbol: p.tradingsymbol, quantity: p.quantity, avgPrice: p.average_price, ltp: p.last_price }));
    },

    async getMargin() {
      const kc = await getZerodhaClient(userId);
      const margins = await kc.getMargins('equity');
      return { available: margins.equity?.available?.live_balance ?? 0, used: margins.equity?.utilised?.debits ?? 0 };
    },

    async cancelAllOrders() {
      const orders = await this.getOrderList();
      for (const o of orders) {
        if (o.status === 'PLACED') {
          try {
            await this.cancelOrder(o.brokerOrderId);
          } catch (err) {
            console.error(`[ZerodhaBroker] cancelAllOrders: failed to cancel ${o.brokerOrderId}:`, err.message);
          }
        }
      }
    },

    async closeAllPositions() {
      const positions = await this.getPositions();
      for (const p of positions) {
        if (!p.quantity) continue;
        try {
          await this.placeOrder({ symbol: p.symbol, action: p.quantity > 0 ? 'SELL' : 'BUY', quantity: Math.abs(p.quantity) });
        } catch (err) {
          console.error(`[ZerodhaBroker] closeAllPositions: failed for ${p.symbol}:`, err.message);
        }
      }
    },
  };
}

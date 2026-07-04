/**
 * Real-money broker backed by the Groww Trade API order endpoints. Used ONLY
 * when live trading is fully configured + enabled (see tradingModeService.js).
 * Auth: access token resolved per request by growwAuth.getAccessToken().
 * Endpoints per https://groww.in/trade-api/docs (Orders). Response envelope:
 * { status: 'SUCCESS'|'FAILURE', payload?, error?: {code, message} }.
 */
import { GROWW_BASE_URL, GROWW_API_VERSION, GROWW_ORDER } from '../../config/constants.js';
import { getAccessToken } from './growwAuth.js';

async function request(path, opts = {}) {
  const { method = 'GET', body, query } = opts;
  const token = await getAccessToken();
  const qs = query
    ? `?${new URLSearchParams(
        Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null)),
      )}`
    : '';

  const res = await fetch(`${GROWW_BASE_URL}${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-VERSION': GROWW_API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || (json?.status && json.status !== 'SUCCESS')) {
    const msg = json?.error?.message || json?.payload?.remark || json?.message || `HTTP ${res.status}`;
    const err = new Error(`Groww API ${path} failed: ${msg}`);
    err.code = 'BROKER_ERROR';
    throw err;
  }
  return json?.payload ?? json;
}

/** @returns {import('../../types.js').BrokerAdapter} */
export function createGrowwBroker() {
  return {
    name: 'groww',

    async isConnected() {
      try {
        await getAccessToken();
        return true;
      } catch {
        return false;
      }
    },

    async connect() {
      await getAccessToken();
    },

    /** @param {import('../../types.js').PlaceOrderInput} o */
    async placeOrder(o) {
      const payload = await request('/order/create', {
        method: 'POST',
        body: {
          trading_symbol: o.symbol,
          exchange: GROWW_ORDER.EXCHANGE_NSE,
          segment: GROWW_ORDER.SEGMENT_CASH,
          quantity: o.quantity,
          transaction_type: o.action,
          order_type: o.orderType === 'LIMIT' ? GROWW_ORDER.ORDER_TYPE_LIMIT : GROWW_ORDER.ORDER_TYPE_MARKET,
          product: GROWW_ORDER.PRODUCT_CNC,
          validity: GROWW_ORDER.VALIDITY_DAY,
          price: o.orderType === 'LIMIT' ? o.price : 0,
          order_reference_id: `growwai-${Date.now()}`,
        },
      });
      return { brokerOrderId: payload.groww_order_id, status: mapStatus(payload.order_status) };
    },

    async modifyOrder(orderId, patch) {
      const payload = await request(`/order/modify`, {
        method: 'POST',
        body: {
          groww_order_id: orderId,
          quantity: patch.quantity,
          price: patch.price,
          order_type: patch.orderType === 'LIMIT' ? GROWW_ORDER.ORDER_TYPE_LIMIT : GROWW_ORDER.ORDER_TYPE_MARKET,
          segment: GROWW_ORDER.SEGMENT_CASH,
        },
      });
      return { brokerOrderId: orderId, status: mapStatus(payload.order_status) };
    },

    async cancelOrder(orderId) {
      const payload = await request('/order/cancel', {
        method: 'POST',
        body: { groww_order_id: orderId, segment: GROWW_ORDER.SEGMENT_CASH },
      });
      return { brokerOrderId: orderId, status: mapStatus(payload.order_status ?? 'CANCELLED') };
    },

    async getOrderStatus(orderId) {
      const payload = await request('/order/detail', {
        query: { groww_order_id: orderId, segment: GROWW_ORDER.SEGMENT_CASH },
      });
      return {
        brokerOrderId: orderId,
        status: mapStatus(payload.order_status),
        filledPrice: payload.average_fill_price,
        filledQuantity: payload.filled_quantity,
      };
    },

    async getOrderList() {
      const payload = await request('/order/list', { query: { segment: GROWW_ORDER.SEGMENT_CASH } });
      const orders = payload?.order_list ?? [];
      return orders.map((o) => ({ brokerOrderId: o.groww_order_id, status: mapStatus(o.order_status) }));
    },

    async getLTP(symbol) {
      const payload = await request('/live_data/quote', {
        query: { exchange: GROWW_ORDER.EXCHANGE_NSE, segment: GROWW_ORDER.SEGMENT_CASH, trading_symbol: symbol },
      });
      return payload?.last_price ?? payload?.ltp;
    },

    async getLTPBatch(symbols) {
      const entries = await Promise.all(
        symbols.map(async (s) => {
          try {
            return [s, await this.getLTP(s)];
          } catch {
            return [s, null];
          }
        }),
      );
      return Object.fromEntries(entries.filter(([, v]) => v != null));
    },

    async getHoldings() {
      const payload = await request('/holdings/user');
      const holdings = payload?.holdings ?? [];
      return holdings.map((h) => ({ symbol: h.trading_symbol, quantity: h.quantity, avgPrice: h.average_price, ltp: 0 }));
    },

    async getPositions() {
      const payload = await request('/positions/user', { query: { segment: GROWW_ORDER.SEGMENT_CASH } });
      const positions = payload?.positions ?? [];
      return positions.map((p) => ({
        symbol: p.trading_symbol,
        quantity: p.quantity,
        avgPrice: p.buy_avg_price ?? p.average_price,
        ltp: 0,
      }));
    },

    async getMargin() {
      const payload = await request('/margins/detail/user');
      return { available: payload?.equity?.available_margin ?? 0, used: payload?.equity?.used_margin ?? 0 };
    },

    async cancelAllOrders() {
      const orders = await this.getOrderList();
      for (const o of orders) {
        if (['PENDING', 'PLACED'].includes(o.status)) {
          try {
            await this.cancelOrder(o.brokerOrderId);
          } catch (err) {
            console.error(`[GrowwBroker] cancelAllOrders: failed to cancel ${o.brokerOrderId}:`, err.message);
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
          console.error(`[GrowwBroker] closeAllPositions: failed for ${p.symbol}:`, err.message);
        }
      }
    },
  };
}

function mapStatus(growwStatus) {
  const map = {
    NEW: 'PLACED',
    ACKED: 'PLACED',
    OPEN: 'PLACED',
    EXECUTED: 'FILLED',
    COMPLETED: 'FILLED',
    CANCELLED: 'CANCELLED',
    REJECTED: 'REJECTED',
    FAILED: 'REJECTED',
  };
  return map[String(growwStatus).toUpperCase()] ?? 'PLACED';
}

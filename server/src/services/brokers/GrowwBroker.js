/**
 * Real-money broker backed by the Groww Trade API order endpoints. Used ONLY
 * when live trading is fully configured + enabled (see tradingModeService.js).
 * Auth: access token resolved per request by growwAuth.getAccessToken().
 * Endpoints verified against https://groww.in/trade-api/docs/curl (Orders,
 * Portfolio, Margin, Live Data sub-pages). Response envelope for all of these
 * (distinct from the token endpoint): { status: 'SUCCESS'|'FAILURE', payload?, error?: {code, message} }.
 */
import { GROWW_BASE_URL, GROWW_API_VERSION, GROWW_ORDER } from '../../config/constants.js';
import { getAccessToken } from './growwAuth.js';

/** @param {string} symbol e.g. 'RELIANCE' @returns {string} Groww order trading_symbol, e.g. 'RELIANCE-EQ' (order endpoints only — quote/LTP endpoints use the bare symbol). */
function toGrowwTradingSymbol(symbol) {
  return `${symbol}-EQ`;
}

/** @param {string} tradingSymbol @returns {string} bare symbol, stripping a trailing '-EQ' if present */
function fromGrowwTradingSymbol(tradingSymbol) {
  return String(tradingSymbol ?? '').replace(/-EQ$/, '');
}

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
          trading_symbol: toGrowwTradingSymbol(o.symbol),
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
      const payload = await request(`/order/detail/${orderId}`, {
        query: { segment: GROWW_ORDER.SEGMENT_CASH },
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
      return orders.map((o) => ({
        brokerOrderId: o.groww_order_id,
        status: mapStatus(o.order_status),
        symbol: fromGrowwTradingSymbol(o.trading_symbol),
        action: o.transaction_type,
        quantity: o.quantity,
        filledPrice: o.average_fill_price || o.price,
        filledQuantity: o.filled_quantity,
        createdAt: o.created_at ? new Date(o.created_at) : null,
      }));
    },

    async getLTP(symbol) {
      const payload = await request('/live-data/quote', {
        query: { exchange: GROWW_ORDER.EXCHANGE_NSE, segment: GROWW_ORDER.SEGMENT_CASH, trading_symbol: symbol },
      });
      return payload?.last_price;
    },

    /** @param {string[]} symbols @returns {Promise<Record<string, number>>} uses the batch LTP endpoint (up to 50 instruments/call) */
    async getLTPBatch(symbols) {
      if (!symbols.length) return {};
      const exchangeSymbols = symbols.map((s) => `NSE_${s}`).join(',');
      const payload = await request('/live-data/ltp', {
        query: { segment: GROWW_ORDER.SEGMENT_CASH, exchange_symbols: exchangeSymbols },
      });
      const out = {};
      for (const s of symbols) {
        const price = payload?.[`NSE_${s}`];
        if (typeof price === 'number') out[s] = price;
      }
      return out;
    },

    async getHoldings() {
      const payload = await request('/holdings/user');
      const holdings = payload?.holdings ?? [];
      return holdings.map((h) => ({ symbol: fromGrowwTradingSymbol(h.trading_symbol), quantity: h.quantity, avgPrice: h.average_price, ltp: 0 }));
    },

    async getPositions() {
      const payload = await request('/positions/user', { query: { segment: GROWW_ORDER.SEGMENT_CASH } });
      const positions = payload?.positions ?? [];
      return positions.map((p) => ({
        symbol: fromGrowwTradingSymbol(p.trading_symbol),
        quantity: p.quantity,
        avgPrice: p.net_price,
        ltp: 0,
      }));
    },

    async getMargin() {
      const payload = await request('/margins/detail/user');
      return { available: payload?.clear_cash ?? 0, used: payload?.net_margin_used ?? 0 };
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

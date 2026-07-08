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
import { retryFillCheck } from '../../utils/retryFillCheck.js';

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

    /**
     * A minted token proves auth works but not that the account can actually trade —
     * /user/detail is the real capability check (NSE cash access + segment enabled).
     */
    async isConnected() {
      try {
        const detail = await this.getUserDetail();
        return Boolean(detail?.nseEnabled && detail?.activeSegments?.includes(GROWW_ORDER.SEGMENT_CASH));
      } catch {
        return false;
      }
    },

    async connect() {
      await getAccessToken();
    },

    /** @returns {Promise<{vendorUserId:string, ucc:string, nseEnabled:boolean, bseEnabled:boolean, ddpiEnabled:boolean, activeSegments:string[]}>} */
    async getUserDetail() {
      const payload = await request('/user/detail');
      return {
        vendorUserId: payload.vendor_user_id,
        ucc: payload.ucc,
        nseEnabled: Boolean(payload.nse_enabled),
        bseEnabled: Boolean(payload.bse_enabled),
        ddpiEnabled: Boolean(payload.ddpi_enabled),
        activeSegments: payload.active_segments ?? [],
      };
    },

    /**
     * Pre-trade margin check (POST /margins/detail/orders) — called from placeOrder() before
     * /order/create so an insufficient-margin order fails fast with a clear message instead
     * of a generic broker rejection. Fails OPEN (returns null, doesn't block the order) if the
     * check call itself errors — a margin-check outage must never be what stops a real trade;
     * /order/create's own rejection is still there as the ultimate authority either way.
     * @param {import('../../types.js').PlaceOrderInput} o
     * @returns {Promise<{totalRequirement:number}|null>}
     */
    async checkOrderMargin(o) {
      try {
        const payload = await request('/margins/detail/orders', {
          method: 'POST',
          query: { segment: GROWW_ORDER.SEGMENT_CASH },
          body: [
            {
              trading_symbol: toGrowwTradingSymbol(o.symbol),
              exchange: GROWW_ORDER.EXCHANGE_NSE,
              segment: GROWW_ORDER.SEGMENT_CASH,
              transaction_type: o.action,
              quantity: o.quantity,
              product: GROWW_ORDER.PRODUCT_MIS,
              order_type: o.orderType === 'LIMIT' ? GROWW_ORDER.ORDER_TYPE_LIMIT : GROWW_ORDER.ORDER_TYPE_MARKET,
              ...(o.orderType === 'LIMIT' ? { price: o.price } : {}),
            },
          ],
        });
        return { totalRequirement: Number(payload?.total_requirement) || 0 };
      } catch (err) {
        console.error(`[GrowwBroker] checkOrderMargin failed for ${o.symbol}, skipping pre-flight check:`, err.message);
        return null;
      }
    },

    /**
     * Every position through this app is intraday (MIS) — never CNC/delivery. CNC would
     * leave the position unmanaged by the broker overnight AND untouched by our own
     * square-off job (which only looks at what we ourselves tracked), i.e. an actual
     * T+1 delivery holding despite this being an "intraday only" platform.
     * @param {import('../../types.js').PlaceOrderInput} o
     */
    async placeOrder(o) {
      if (o.action === GROWW_ORDER.TRANSACTION_BUY) {
        const margin = await this.checkOrderMargin(o);
        if (margin) {
          // Same fail-open principle as checkOrderMargin itself — an available-margin
          // lookup failure here must not be what blocks a real trade; only an actual,
          // confirmed insufficient-margin result should.
          try {
            const { available } = await this.getMargin();
            if (margin.totalRequirement > available) {
              const err = new Error(
                `Insufficient margin: order needs ₹${margin.totalRequirement.toFixed(2)}, only ₹${available.toFixed(2)} available.`,
              );
              err.code = 'BROKER_ERROR';
              throw err;
            }
          } catch (err) {
            if (err.code === 'BROKER_ERROR' && err.message.startsWith('Insufficient margin')) throw err;
            console.error(`[GrowwBroker] getMargin failed during pre-flight check for ${o.symbol}, skipping:`, err.message);
          }
        }
      }

      const payload = await request('/order/create', {
        method: 'POST',
        body: {
          trading_symbol: toGrowwTradingSymbol(o.symbol),
          exchange: GROWW_ORDER.EXCHANGE_NSE,
          segment: GROWW_ORDER.SEGMENT_CASH,
          quantity: o.quantity,
          transaction_type: o.action,
          order_type: o.orderType === 'LIMIT' ? GROWW_ORDER.ORDER_TYPE_LIMIT : GROWW_ORDER.ORDER_TYPE_MARKET,
          product: GROWW_ORDER.PRODUCT_MIS,
          validity: GROWW_ORDER.VALIDITY_DAY,
          price: o.orderType === 'LIMIT' ? o.price : 0,
          order_reference_id: `growwai-${Date.now()}`,
        },
      });

      // MARKET orders on NSE cash equity fill near-instantly — check (with a short retry
      // backoff, see retryFillCheck.js) so recordLiveFill (orderService.js) actually gets
      // a filledPrice/filledQuantity instead of always silently no-op'ing. Whatever this
      // still misses gets backfilled by orderReconciliationJob.js.
      const brokerOrderId = payload.groww_order_id;
      const detail = await retryFillCheck(() => this.getOrderStatus(brokerOrderId));
      if (detail) return { brokerOrderId, status: detail.status, filledPrice: detail.filledPrice, filledQuantity: detail.filledQuantity };
      return { brokerOrderId, status: mapStatus(payload.order_status) };
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

    /** @param {string} orderId @returns {Promise<object[]>} individual fill/execution records for an order (handles partial fills across multiple trades). */
    async getOrderTrades(orderId) {
      const payload = await request(`/order/trades/${orderId}`, { query: { segment: GROWW_ORDER.SEGMENT_CASH } });
      const trades = payload?.trade_list ?? [];
      return trades.map((t) => ({
        tradeId: t.groww_trade_id,
        price: t.price,
        quantity: t.quantity,
        tradedAt: t.trade_date_time ? new Date(t.trade_date_time) : null,
      }));
    },

    /** @param {string} referenceId our own `order_reference_id` passed at creation time @returns {Promise<OrderResult>} */
    async getOrderStatusByReference(referenceId) {
      const payload = await request(`/order/status/reference/${referenceId}`, {
        query: { segment: GROWW_ORDER.SEGMENT_CASH },
      });
      return {
        brokerOrderId: payload.groww_order_id,
        status: mapStatus(payload.order_status),
        filledPrice: payload.average_fill_price,
        filledQuantity: payload.filled_quantity,
      };
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

    /** @param {string} symbol @returns {Promise<Holding|null>} single-symbol position lookup, cheaper than getPositions() when only one symbol is needed. */
    async getPositionBySymbol(symbol) {
      const payload = await request('/positions/trading-symbol', {
        query: { segment: GROWW_ORDER.SEGMENT_CASH, exchange: GROWW_ORDER.EXCHANGE_NSE, trading_symbol: toGrowwTradingSymbol(symbol) },
      });
      if (!payload) return null;
      return { symbol, quantity: payload.quantity, avgPrice: payload.net_price, ltp: 0 };
    },

    async getMargin() {
      const payload = await request('/margins/detail/user');
      return { available: payload?.clear_cash ?? 0, used: payload?.net_margin_used ?? 0 };
    },

    // --- Smart Orders (GTT/OCO) — /order-advance/* — a broker-side stop-loss/target safety
    // net placed alongside positionGuardianJob's own 15s polling (see orderService.js's
    // BUY/SELL live-fill handling and positionGuardianJob.js's reconciliation check). Only
    // Groww implements these on the BrokerAdapter — callers must feature-detect
    // (`typeof broker.placeProtectiveOco === 'function'`) before calling.

    /**
     * Places a one-cancels-other exit order: a LIMIT SELL at `target` and an SL_M
     * (stop-loss market) SELL at `stopLoss`, whichever triggers first cancels the other.
     * Always a SELL — this platform never opens a short position, SELL only ever closes an
     * existing long (see autoTradingService.js), so the protective leg is always an exit.
     * @param {{symbol:string, quantity:number, stopLoss:number, target:number}} o
     * @returns {Promise<{smartOrderId:string, smartOrderType:string, status:string}>}
     */
    async placeProtectiveOco(o) {
      const payload = await request('/order-advance/create', {
        method: 'POST',
        body: {
          reference_id: `growwai-oco-${Date.now()}`,
          smart_order_type: GROWW_ORDER.SMART_ORDER_TYPE_OCO,
          segment: GROWW_ORDER.SEGMENT_CASH,
          exchange: GROWW_ORDER.EXCHANGE_NSE,
          trading_symbol: toGrowwTradingSymbol(o.symbol),
          quantity: o.quantity,
          net_position_quantity: o.quantity,
          transaction_type: GROWW_ORDER.TRANSACTION_SELL,
          target: { trigger_price: String(o.target), order_type: GROWW_ORDER.ORDER_TYPE_LIMIT, price: String(o.target) },
          stop_loss: { trigger_price: String(o.stopLoss), order_type: GROWW_ORDER.ORDER_TYPE_SL_M, price: null },
          product_type: GROWW_ORDER.PRODUCT_MIS,
          duration: GROWW_ORDER.VALIDITY_DAY,
        },
      });
      return { smartOrderId: payload.smart_order_id, smartOrderType: payload.smart_order_type, status: payload.status };
    },

    /**
     * @param {string} smartOrderId @param {string} [smartOrderType] @param {string} [segment]
     * @returns {Promise<{smartOrderId:string, status:string}>}
     */
    async cancelSmartOrder(smartOrderId, smartOrderType = GROWW_ORDER.SMART_ORDER_TYPE_OCO, segment = GROWW_ORDER.SEGMENT_CASH) {
      const payload = await request(`/order-advance/cancel/${segment}/${smartOrderType}/${smartOrderId}`, { method: 'POST' });
      return { smartOrderId, status: payload.status };
    },

    /**
     * @param {string} smartOrderId @param {string} [smartOrderType] @param {string} [segment]
     * @returns {Promise<{smartOrderId:string, status:'ACTIVE'|'CANCELLED'|'COMPLETED', triggeredAt:Date|null}>}
     */
    async getSmartOrderStatus(smartOrderId, smartOrderType = GROWW_ORDER.SMART_ORDER_TYPE_OCO, segment = GROWW_ORDER.SEGMENT_CASH) {
      const payload = await request(`/order-advance/status/${segment}/${smartOrderType}/internal/${smartOrderId}`);
      return {
        smartOrderId: payload.smart_order_id,
        status: payload.status,
        triggeredAt: payload.triggered_at ? new Date(payload.triggered_at) : null,
      };
    },

    /** @param {{segment?:string, smartOrderType?:string, status?:string}} [opts] @returns {Promise<object[]>} */
    async listSmartOrders(opts = {}) {
      const payload = await request('/order-advance/list', {
        query: {
          segment: opts.segment ?? GROWW_ORDER.SEGMENT_CASH,
          smart_order_type: opts.smartOrderType ?? GROWW_ORDER.SMART_ORDER_TYPE_OCO,
          status: opts.status ?? 'ACTIVE',
          page: 0,
          page_size: 50,
        },
      });
      return payload?.orders ?? [];
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

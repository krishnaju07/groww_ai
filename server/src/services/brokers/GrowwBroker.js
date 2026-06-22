/**
 * Real-money broker backed by the Groww Trade API order endpoints.
 *
 * Used ONLY when live trading is fully configured + enabled (see `brokers/index.js`
 * → `isLiveConfigured` / `assertLiveAllowed`). Every method here places or reads
 * against the user's REAL Groww account.
 *
 * Auth: the access token is resolved per request by `growwAuth.getAccessToken()`
 * (static GROWW_ACCESS_TOKEN, or an auto-generated + cached daily token).
 *
 * Endpoints faithful to https://groww.in/trade-api/docs (Orders). Responses use the
 * envelope { status: 'SUCCESS'|'FAILURE', payload? , error?: {code,message,metadata} }.
 */

import { GROWW_BASE_URL, GROWW_API_VERSION, GROWW_ORDER } from '../../config/constants.js';
import { getAccessToken } from './growwAuth.js';

export class GrowwBroker {
  name = 'groww';

  /**
   * Low-level request helper. Resolves the access token, calls the API, and
   * returns the Groww `payload`, throwing a coded error on transport failure or a
   * FAILURE status (extracting the documented `error.message`).
   * @param {string} path  e.g. '/order/create'
   * @param {{ method?: string, body?: any, query?: Record<string,string|number> }} [opts]
   * @returns {Promise<any>}
   */
  async request(path, opts = {}) {
    const { method = 'GET', body, query } = opts;
    const token = await getAccessToken();

    const qs = query
      ? `?${new URLSearchParams(
          Object.fromEntries(
            Object.entries(query)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)]),
          ),
        ).toString()}`
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

    if (!res.ok || (json && json.status && json.status !== 'SUCCESS')) {
      // Documented failure envelope: { status:'FAILURE', error:{ code, message } }.
      const msg =
        json?.error?.message ||
        json?.payload?.remark ||
        json?.message ||
        `HTTP ${res.status}`;
      const err = new Error(`Groww API ${path} failed: ${msg}`);
      err.code = 'BROKER_ERROR';
      throw err;
    }
    return json?.payload ?? json;
  }

  /**
   * Place a live order. POST /v1/order/create.
   * @param {Object} o
   * @param {string} o.tradingSymbol
   * @param {string} o.exchange
   * @param {string} o.segment
   * @param {number} o.quantity
   * @param {('BUY'|'SELL')} o.transactionType
   * @param {string} [o.orderType]    MARKET | LIMIT | SL | SL-M
   * @param {string} [o.product]      CNC | MIS | NRML
   * @param {string} [o.validity]     DAY | IOC
   * @param {number} [o.price]        required for LIMIT/SL; MARKET sends 0
   * @param {number} [o.triggerPrice] required for SL / SL-M orders
   * @param {string} [o.referenceId]  optional idempotency key (reuse → "Duplicate order reference id")
   * @returns {Promise<{ groww_order_id:string, order_status:string, order_reference_id?:string, remark?:string }>}
   */
  async placeOrder(o) {
    const orderType = o.orderType || GROWW_ORDER.orderType;
    const body = {
      trading_symbol: o.tradingSymbol,
      quantity: o.quantity,
      // Groww requires `price` on every order; it must be 0 for MARKET orders.
      price: orderType === 'MARKET' ? 0 : Number(o.price ?? 0),
      order_type: orderType,
      transaction_type: o.transactionType,
      validity: o.validity || GROWW_ORDER.validity,
      exchange: o.exchange,
      segment: o.segment,
      product: o.product || GROWW_ORDER.product,
    };
    // trigger_price only applies to stop-loss order types.
    if ((orderType === 'SL' || orderType === 'SL-M') && o.triggerPrice != null) {
      body.trigger_price = Number(o.triggerPrice);
    }
    if (o.referenceId) body.order_reference_id = o.referenceId;
    return this.request('/order/create', { method: 'POST', body });
  }

  /**
   * Modify a pending/open order. POST /v1/order/modify.
   * @param {Object} o
   * @param {string} o.growwOrderId
   * @param {string} o.segment
   * @param {number} [o.quantity]
   * @param {number} [o.price]
   * @param {number} [o.triggerPrice]
   * @param {string} [o.orderType]
   * @returns {Promise<{ groww_order_id:string, order_status:string }>}
   */
  async modifyOrder(o) {
    const body = { groww_order_id: o.growwOrderId, segment: o.segment || GROWW_ORDER.segment };
    if (o.quantity != null) body.quantity = o.quantity;
    if (o.price != null) body.price = Number(o.price);
    if (o.triggerPrice != null) body.trigger_price = Number(o.triggerPrice);
    if (o.orderType) body.order_type = o.orderType;
    return this.request('/order/modify', { method: 'POST', body });
  }

  /**
   * Cancel a pending/open order. POST /v1/order/cancel.
   * @param {string} growwOrderId
   * @param {string} [segment]
   * @returns {Promise<{ groww_order_id:string, order_status:string }>}
   */
  async cancelOrder(growwOrderId, segment = GROWW_ORDER.segment) {
    return this.request('/order/cancel', {
      method: 'POST',
      body: { groww_order_id: growwOrderId, segment },
    });
  }

  /**
   * Order status by Groww order id. GET /v1/order/status/{id}?segment=...
   * @param {string} growwOrderId
   * @param {string} [segment]
   */
  async getOrderStatus(growwOrderId, segment = GROWW_ORDER.segment) {
    return this.request(`/order/status/${encodeURIComponent(growwOrderId)}`, { query: { segment } });
  }

  /**
   * Order status by client reference id. GET /v1/order/status/reference/{ref}?segment=...
   * @param {string} referenceId
   * @param {string} [segment]
   */
  async getOrderStatusByReference(referenceId, segment = GROWW_ORDER.segment) {
    return this.request(`/order/status/reference/${encodeURIComponent(referenceId)}`, {
      query: { segment },
    });
  }

  /**
   * Full order details by Groww order id. GET /v1/order/detail/{id}?segment=...
   * @param {string} growwOrderId
   * @param {string} [segment]
   */
  async getOrderDetail(growwOrderId, segment = GROWW_ORDER.segment) {
    return this.request(`/order/detail/${encodeURIComponent(growwOrderId)}`, { query: { segment } });
  }

  /**
   * Trades (fills) for an order. GET /v1/order/trades/{id}?segment&page&page_size
   * @param {string} growwOrderId
   * @param {{ segment?: string, page?: number, pageSize?: number }} [opts]
   * @returns {Promise<Array<Object>>}
   */
  async getOrderTrades(growwOrderId, opts = {}) {
    const payload = await this.request(`/order/trades/${encodeURIComponent(growwOrderId)}`, {
      query: {
        segment: opts.segment || GROWW_ORDER.segment,
        page: opts.page ?? 0,
        page_size: opts.pageSize ?? 50,
      },
    });
    return payload?.trade_list || [];
  }

  /**
   * Today's order book. GET /v1/order/list?segment&page&page_size
   * @param {{ segment?: string, page?: number, pageSize?: number }} [opts]
   * @returns {Promise<Array<Object>>}
   */
  async getOrderList(opts = {}) {
    const payload = await this.request('/order/list', {
      query: {
        segment: opts.segment || GROWW_ORDER.segment,
        page: opts.page ?? 0,
        page_size: opts.pageSize ?? 100,
      },
    });
    return payload?.order_list || [];
  }

  // --- Smart Orders (GTT / OCO) — POST/PUT /v1/order-advance/* ---
  // NOTE: OCO is NOT supported for the CASH segment (FNO only); COMMODITY is
  // unsupported entirely. Our equity universe is CASH, so GTT is the usable
  // native stop/target mechanism here.

  /**
   * Create a GTT smart order (single trigger-armed order). POST /v1/order-advance/create.
   * @param {Object} o
   * @param {string} o.referenceId         unique client reference
   * @param {string} o.tradingSymbol
   * @param {number} o.quantity
   * @param {number} o.triggerPrice
   * @param {('UP'|'DOWN')} o.triggerDirection
   * @param {{ orderType?: string, transactionType: ('BUY'|'SELL'), price?: number }} o.order
   * @param {string} [o.segment]
   * @param {string} [o.exchange]
   * @param {string} [o.productType]
   * @param {string} [o.duration]
   * @returns {Promise<{ smart_order_id:string, smart_order_type:string, status:string }>}
   */
  async createGttOrder(o) {
    const order = {
      order_type: o.order?.orderType || 'MARKET',
      transaction_type: o.order?.transactionType,
    };
    if (o.order?.price != null) order.price = String(o.order.price);

    const body = {
      reference_id: o.referenceId,
      smart_order_type: 'GTT',
      segment: o.segment || GROWW_ORDER.segment,
      trading_symbol: o.tradingSymbol,
      quantity: o.quantity,
      trigger_price: String(o.triggerPrice),
      trigger_direction: o.triggerDirection,
      order,
      product_type: o.productType || GROWW_ORDER.product,
      exchange: o.exchange || GROWW_ORDER.exchange,
      duration: o.duration || 'DAY',
    };
    return this.request('/order-advance/create', { method: 'POST', body });
  }

  /**
   * Create an OCO smart order (target + stop-loss). POST /v1/order-advance/create.
   * FNO segment only — rejected for CASH by Groww.
   * @param {Object} o
   * @param {string} o.referenceId
   * @param {string} o.segment              must be 'FNO'
   * @param {string} o.tradingSymbol
   * @param {number} o.quantity
   * @param {('BUY'|'SELL')} o.transactionType
   * @param {{ trigger_price:string, order_type:string, price?:string|null }} o.target
   * @param {{ trigger_price:string, order_type:string, price?:string|null }} o.stopLoss
   * @param {number} [o.netPositionQuantity]
   * @param {string} [o.productType]
   * @param {string} [o.exchange]
   * @param {string} [o.duration]
   * @returns {Promise<{ smart_order_id:string, smart_order_type:string, status:string }>}
   */
  async createOcoOrder(o) {
    const body = {
      reference_id: o.referenceId,
      smart_order_type: 'OCO',
      segment: o.segment,
      trading_symbol: o.tradingSymbol,
      quantity: o.quantity,
      net_position_quantity: o.netPositionQuantity ?? o.quantity,
      transaction_type: o.transactionType,
      target: o.target,
      stop_loss: o.stopLoss,
      product_type: o.productType,
      exchange: o.exchange || GROWW_ORDER.exchange,
      duration: o.duration || 'DAY',
    };
    return this.request('/order-advance/create', { method: 'POST', body });
  }

  /**
   * Modify a smart order. PUT /v1/order-advance/modify/{smart_order_id}.
   * Only the per-type modifiable fields are honoured; otherwise cancel + create.
   * @param {string} smartOrderId
   * @param {Object} body  modify payload (must include smart_order_type + segment)
   */
  async modifySmartOrder(smartOrderId, body) {
    return this.request(`/order-advance/modify/${encodeURIComponent(smartOrderId)}`, {
      method: 'PUT',
      body,
    });
  }

  /**
   * Cancel a smart order. POST /v1/order-advance/cancel/{segment}/{type}/{id}.
   * @param {string} segment
   * @param {('GTT'|'OCO')} smartOrderType
   * @param {string} smartOrderId
   */
  async cancelSmartOrder(segment, smartOrderType, smartOrderId) {
    return this.request(
      `/order-advance/cancel/${encodeURIComponent(segment)}/${encodeURIComponent(smartOrderType)}/${encodeURIComponent(smartOrderId)}`,
      { method: 'POST' },
    );
  }

  /**
   * Get a smart order. GET /v1/order-advance/status/{segment}/{type}/internal/{id}.
   * @param {string} segment
   * @param {('GTT'|'OCO')} smartOrderType
   * @param {string} smartOrderId
   */
  async getSmartOrder(segment, smartOrderType, smartOrderId) {
    return this.request(
      `/order-advance/status/${encodeURIComponent(segment)}/${encodeURIComponent(smartOrderType)}/internal/${encodeURIComponent(smartOrderId)}`,
    );
  }

  /**
   * List smart orders with optional filters. GET /v1/order-advance/list.
   * @param {{ segment?:string, smartOrderType?:string, status?:string, page?:number, pageSize?:number, startDateTime?:string, endDateTime?:string }} [opts]
   * @returns {Promise<Array<Object>>}
   */
  async listSmartOrders(opts = {}) {
    const payload = await this.request('/order-advance/list', {
      query: {
        segment: opts.segment,
        smart_order_type: opts.smartOrderType,
        status: opts.status,
        page: opts.page ?? 0,
        page_size: opts.pageSize ?? 10,
        start_date_time: opts.startDateTime,
        end_date_time: opts.endDateTime,
      },
    });
    return payload?.orders || [];
  }

  /**
   * Live equity holdings for the user.
   * NOTE: field names follow Groww's documented holdings payload — verify against
   * your real account response and adjust the mapping in portfolioService if needed.
   * @returns {Promise<Array<Object>>}
   */
  async getHoldings() {
    const payload = await this.request('/holdings/user');
    const list = payload?.holdings || payload;
    return Array.isArray(list) ? list : [];
  }

  /**
   * Live positions for the user.
   * @param {string} [segment]
   * @returns {Promise<Array<Object>>}
   */
  async getPositions(segment = GROWW_ORDER.segment) {
    const payload = await this.request('/positions/user', { query: { segment } });
    const list = payload?.positions || payload;
    return Array.isArray(list) ? list : [];
  }

  /**
   * Positions for a single instrument. GET /v1/positions/trading-symbol
   * @param {string} tradingSymbol
   * @param {string} [segment]
   * @returns {Promise<Array<Object>>}
   */
  async getPositionForSymbol(tradingSymbol, segment = GROWW_ORDER.segment) {
    const payload = await this.request('/positions/trading-symbol', {
      query: { trading_symbol: tradingSymbol, segment },
    });
    const list = payload?.positions || payload;
    return Array.isArray(list) ? list : [];
  }

  /**
   * Available user margin. GET /v1/margins/detail/user
   * @returns {Promise<Object>} e.g. { clear_cash, equity_margin_details: { cnc_balance_available, ... }, ... }
   */
  async getMargin() {
    return this.request('/margins/detail/user');
  }

  /**
   * Required margin for one or more orders. POST /v1/margins/detail/orders?segment=
   * (Basket orders are FNO/COMMODITY only; CASH is single-order.)
   * @param {Array<Object>|Object} orders  { trading_symbol, transaction_type, quantity, price?, order_type, product, exchange }
   * @param {string} [segment]
   * @returns {Promise<Object>} e.g. { total_requirement, cash_cnc_margin_required, ... }
   */
  async getRequiredMargin(orders, segment = GROWW_ORDER.segment) {
    return this.request('/margins/detail/orders', {
      method: 'POST',
      query: { segment },
      body: Array.isArray(orders) ? orders : [orders],
    });
  }

  // --- Account / live data helpers ---

  /**
   * User profile: identifiers, enabled exchanges and active segments. Useful as a
   * live-connectivity check (validates the token + confirms CASH is enabled).
   * GET /v1/user/detail
   * @returns {Promise<{ vendor_user_id:string, ucc:string, nse_enabled:boolean, bse_enabled:boolean, ddpi_enabled:boolean, active_segments:string[] }>}
   */
  async getUserProfile() {
    return this.request('/user/detail');
  }

  /**
   * Batch last-traded price for up to 50 instruments. GET /v1/live-data/ltp
   * @param {string[]} exchangeSymbols  e.g. ['NSE_RELIANCE'] (Groww exchange symbols)
   * @param {string} [segment]
   * @returns {Promise<Record<string, number>>} map of exchange symbol -> price
   */
  async getLtp(exchangeSymbols, segment = GROWW_ORDER.segment) {
    return this.request('/live-data/ltp', {
      query: { segment, exchange_symbols: exchangeSymbols.join(',') },
    });
  }

  /**
   * Batch current-snapshot OHLC for up to 50 instruments. GET /v1/live-data/ohlc
   * @param {string[]} exchangeSymbols
   * @param {string} [segment]
   * @returns {Promise<Record<string, string>>} map of exchange symbol -> ohlc string
   */
  async getOhlc(exchangeSymbols, segment = GROWW_ORDER.segment) {
    return this.request('/live-data/ohlc', {
      query: { segment, exchange_symbols: exchangeSymbols.join(',') },
    });
  }
}

export const growwBroker = new GrowwBroker();
export default growwBroker;

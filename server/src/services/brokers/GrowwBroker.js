/**
 * Real-money broker backed by the Groww Trade API order endpoints.
 *
 * Used ONLY when live trading is fully configured + enabled (see `brokers/index.js`
 * → `isLiveConfigured` / `assertLiveAllowed`). Every method here places or reads
 * against the user's REAL Groww account. Docs: https://groww.in/trade-api/docs
 */

import { env } from '../../config/env.js';
import { GROWW_BASE_URL, GROWW_API_VERSION, GROWW_ORDER } from '../../config/constants.js';

export class GrowwBroker {
  name = 'groww';

  /**
   * Authenticated JSON headers for every Groww request.
   * @returns {Record<string,string>}
   * @throws {Error} when the access token is missing
   */
  headers() {
    if (!env.GROWW_ACCESS_TOKEN) throw new Error('GROWW_ACCESS_TOKEN is not configured');
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${env.GROWW_ACCESS_TOKEN}`,
      'X-API-VERSION': GROWW_API_VERSION,
    };
  }

  /**
   * Low-level request helper. Returns the Groww `payload`, throwing a coded
   * error on transport failure or a non-SUCCESS status.
   * @param {string} path  e.g. '/order/create'
   * @param {{ method?: string, body?: any, query?: Record<string,string> }} [opts]
   * @returns {Promise<any>}
   */
  async request(path, opts = {}) {
    const { method = 'GET', body, query } = opts;
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    const res = await fetch(`${GROWW_BASE_URL}${path}${qs}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json && json.status && json.status !== 'SUCCESS')) {
      const msg = json?.payload?.remark || json?.error || json?.message || `HTTP ${res.status}`;
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
   * @param {string} [o.orderType]   MARKET | LIMIT | SL ...
   * @param {string} [o.product]     CNC | MIS ...
   * @param {string} [o.validity]    DAY | IOC ...
   * @param {number} [o.price]       required for LIMIT/SL
   * @param {string} [o.referenceId] 8–20 alphanumerics (≤2 hyphens)
   * @returns {Promise<{ groww_order_id:string, order_status:string, order_reference_id?:string, remark?:string }>}
   */
  async placeOrder(o) {
    const body = {
      trading_symbol: o.tradingSymbol,
      quantity: o.quantity,
      validity: o.validity || GROWW_ORDER.validity,
      exchange: o.exchange,
      segment: o.segment,
      product: o.product || GROWW_ORDER.product,
      order_type: o.orderType || GROWW_ORDER.orderType,
      transaction_type: o.transactionType,
    };
    if (o.price != null && body.order_type !== 'MARKET') body.price = o.price;
    if (o.referenceId) body.order_reference_id = o.referenceId;
    return this.request('/order/create', { method: 'POST', body });
  }

  /**
   * Cancel a live order. POST /v1/order/cancel.
   * @param {string} growwOrderId
   * @param {string} [segment]
   */
  async cancelOrder(growwOrderId, segment = GROWW_ORDER.segment) {
    return this.request('/order/cancel', {
      method: 'POST',
      body: { groww_order_id: growwOrderId, segment },
    });
  }

  /**
   * Order status by Groww order id. GET /v1/order/status/{id}.
   * @param {string} growwOrderId
   */
  async getOrderStatus(growwOrderId) {
    return this.request(`/order/status/${encodeURIComponent(growwOrderId)}`);
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
}

export const growwBroker = new GrowwBroker();
export default growwBroker;

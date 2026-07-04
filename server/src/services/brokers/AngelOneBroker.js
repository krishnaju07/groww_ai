/**
 * Angel One Smart API broker adapter. Requires a numeric `symboltoken` per
 * order/quote call (resolved via angelOneInstruments.js from Angel One's
 * public scrip master) in addition to the trading symbol.
 */
import { getAngelOneClient } from './angelOneAuth.js';
import { resolveSymbolToken, toAngelTradingSymbol } from './angelOneInstruments.js';

function mapStatus(angelStatus) {
  const s = String(angelStatus ?? '').toLowerCase();
  if (['complete', 'executed'].includes(s)) return 'FILLED';
  if (['open', 'open pending', 'pending', 'validation pending', 'put order req received'].includes(s)) return 'PLACED';
  if (s === 'cancelled') return 'CANCELLED';
  if (['rejected', 'modify rejected', 'cancel rejected'].includes(s)) return 'REJECTED';
  return 'PLACED';
}

/** @param {string} userId @returns {import('../../types.js').BrokerAdapter} */
export function createAngelOneBroker(userId) {
  return {
    name: 'angelone',

    async isConnected() {
      try {
        const client = await getAngelOneClient(userId);
        await client.getProfile();
        return true;
      } catch {
        return false;
      }
    },

    async connect() {
      await getAngelOneClient(userId);
    },

    /** @param {import('../../types.js').PlaceOrderInput} o */
    async placeOrder(o) {
      const client = await getAngelOneClient(userId);
      const token = await resolveSymbolToken(o.symbol);
      const res = await client.placeOrder({
        variety: 'NORMAL',
        tradingsymbol: toAngelTradingSymbol(o.symbol),
        symboltoken: token,
        transactiontype: o.action,
        exchange: 'NSE',
        ordertype: o.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        producttype: 'DELIVERY',
        duration: 'DAY',
        price: o.orderType === 'LIMIT' ? String(o.price) : '0',
        squareoff: '0',
        stoploss: '0',
        quantity: String(o.quantity),
      });
      if (!res?.status) throw brokerError(res, 'placeOrder');
      return { brokerOrderId: res.data.orderid, status: 'PLACED' };
    },

    async modifyOrder(orderId, patch) {
      const client = await getAngelOneClient(userId);
      const res = await client.modifyOrder({
        variety: 'NORMAL',
        orderid: orderId,
        ordertype: patch.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        duration: 'DAY',
        price: patch.price != null ? String(patch.price) : '0',
        quantity: patch.quantity != null ? String(patch.quantity) : undefined,
      });
      if (!res?.status) throw brokerError(res, 'modifyOrder');
      return { brokerOrderId: orderId, status: 'PLACED' };
    },

    async cancelOrder(orderId) {
      const client = await getAngelOneClient(userId);
      const res = await client.cancelOrder({ variety: 'NORMAL', orderid: orderId });
      if (!res?.status) throw brokerError(res, 'cancelOrder');
      return { brokerOrderId: orderId, status: 'CANCELLED' };
    },

    async getOrderStatus(orderId) {
      const orders = await this.getOrderList();
      const order = orders.find((o) => o.brokerOrderId === orderId);
      if (!order) {
        const e = new Error(`Angel One order ${orderId} not found.`);
        e.code = 'ORDER_NOT_FOUND';
        e.status = 404;
        throw e;
      }
      return order;
    },

    async getOrderList() {
      const client = await getAngelOneClient(userId);
      const res = await client.getOrderBook();
      if (!res?.status) throw brokerError(res, 'getOrderBook');
      return (res.data ?? []).map((o) => ({
        brokerOrderId: o.orderid,
        status: mapStatus(o.status),
        symbol: o.tradingsymbol?.replace(/-EQ$/, ''),
        action: o.transactiontype,
        quantity: Number(o.quantity) || undefined,
        filledPrice: Number(o.averageprice) || undefined,
        filledQuantity: Number(o.filledshares) || undefined,
        createdAt: o.updatetime ? new Date(o.updatetime) : null,
      }));
    },

    async getLTP(symbol) {
      const client = await getAngelOneClient(userId);
      const token = await resolveSymbolToken(symbol);
      const res = await client.marketData({ mode: 'LTP', exchangeTokens: { NSE: [token] } });
      if (!res?.status) throw brokerError(res, 'marketData');
      const fetched = res.data?.fetched?.[0];
      if (!fetched) throw new Error(`Angel One LTP ${symbol} → no data`);
      return Number(fetched.ltp);
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
      const client = await getAngelOneClient(userId);
      const res = await client.getHolding();
      if (!res?.status) throw brokerError(res, 'getHolding');
      return (res.data ?? []).map((h) => ({
        symbol: h.tradingsymbol?.replace(/-EQ$/, ''),
        quantity: Number(h.quantity),
        avgPrice: Number(h.averageprice),
        ltp: Number(h.ltp) || 0,
      }));
    },

    async getPositions() {
      const client = await getAngelOneClient(userId);
      const res = await client.getPosition();
      if (!res?.status) throw brokerError(res, 'getPosition');
      return (res.data ?? []).map((p) => ({
        symbol: p.tradingsymbol?.replace(/-EQ$/, ''),
        quantity: Number(p.netqty),
        avgPrice: Number(p.avgnetprice),
        ltp: Number(p.ltp) || 0,
      }));
    },

    async getMargin() {
      const client = await getAngelOneClient(userId);
      const res = await client.getRMS();
      if (!res?.status) throw brokerError(res, 'getRMS');
      return { available: Number(res.data?.availablecash) || 0, used: Number(res.data?.utiliseddebits) || 0 };
    },

    async cancelAllOrders() {
      const orders = await this.getOrderList();
      for (const o of orders) {
        if (o.status === 'PLACED') {
          try {
            await this.cancelOrder(o.brokerOrderId);
          } catch (err) {
            console.error(`[AngelOneBroker] cancelAllOrders: failed to cancel ${o.brokerOrderId}:`, err.message);
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
          console.error(`[AngelOneBroker] closeAllPositions: failed for ${p.symbol}:`, err.message);
        }
      }
    },
  };
}

function brokerError(res, method) {
  const e = new Error(`Angel One ${method} failed: ${res?.message || 'unknown error'}`);
  e.code = 'BROKER_ERROR';
  return e;
}

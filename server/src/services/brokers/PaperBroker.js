/**
 * Simulated broker — the only broker that requires zero external credentials.
 * Maintains its own ledger in Order/Position/Trade (all tagged `broker:'paper'`);
 * `getLTP`/`getLTPBatch`/`getCandles` delegate to the real marketData service so
 * paper prices track the market realistically.
 */
import { Order } from '../../models/Order.js';
import { Position } from '../../models/Position.js';
import { Trade } from '../../models/Trade.js';
import { User } from '../../models/User.js';
import { marketData } from '../marketData/index.js';
import { round2 } from '../../utils/format.js';
import { PAPER_SLIPPAGE } from '../../config/constants.js';

function fillPrice(ltp, action) {
  const slip = action === 'BUY' ? 1 + PAPER_SLIPPAGE : 1 - PAPER_SLIPPAGE;
  return round2(ltp * slip);
}

/** @param {string} userId @returns {import('../../types.js').BrokerAdapter} */
export function createPaperBroker(userId) {
  return {
    name: 'paper',

    async isConnected() {
      return true;
    },

    async connect() {
      // no-op: paper trading needs no external session
    },

    /** @param {import('../../types.js').PlaceOrderInput} o */
    async placeOrder(o) {
      const ltp = await marketData.getLTP(o.symbol);
      const price = o.orderType === 'LIMIT' && o.price ? o.price : fillPrice(ltp, o.action);
      const investmentAmount = round2(price * o.quantity);

      if (o.action === 'BUY') {
        const user = await User.findById(userId);
        if (!user || user.availableCapital < investmentAmount) {
          const e = new Error('Insufficient paper capital for this order.');
          e.code = 'INSUFFICIENT_CAPITAL';
          e.status = 400;
          throw e;
        }
        await User.updateOne({ _id: userId }, { $inc: { availableCapital: -investmentAmount } });

        const trade = await Trade.create({
          userId,
          broker: 'paper',
          mode: 'paper',
          symbol: o.symbol,
          action: 'BUY',
          quantity: o.quantity,
          price,
          investmentAmount,
          tradeSource: o.source ?? 'manual',
          triggerReason: o.triggerReason ?? '',
          status: 'OPEN',
          aiDecisionId: o.aiDecisionId ?? null,
        });

        const existing = await Position.findOne({ userId, broker: 'paper', symbol: o.symbol });
        const newQuantity = (existing?.quantity ?? 0) + o.quantity;
        const newInvestedAmount = round2((existing?.investedAmount ?? 0) + investmentAmount);
        const newAvgBuyPrice = round2(newInvestedAmount / newQuantity);
        const newHighest = Math.max(existing?.highestPriceSeen ?? 0, price);

        await Position.findOneAndUpdate(
          { userId, broker: 'paper', symbol: o.symbol },
          {
            quantity: newQuantity,
            investedAmount: newInvestedAmount,
            avgBuyPrice: newAvgBuyPrice,
            highestPriceSeen: newHighest,
            stopLoss: o.stopLoss ?? existing?.stopLoss ?? null,
            target: o.target ?? existing?.target ?? null,
            aiDecisionId: o.aiDecisionId ?? existing?.aiDecisionId ?? null,
            $setOnInsert: { openedAt: new Date() },
          },
          { upsert: true, new: true },
        );

        return { brokerOrderId: String(trade._id), status: 'FILLED', filledPrice: price, filledQuantity: o.quantity };
      }

      // SELL: close (fully or partially) the existing paper position
      const position = await Position.findOne({ userId, broker: 'paper', symbol: o.symbol });
      if (!position || position.quantity < o.quantity) {
        const e = new Error(`No sufficient paper position in ${o.symbol} to sell.`);
        e.code = 'NO_POSITION';
        e.status = 400;
        throw e;
      }

      const proceeds = investmentAmount;
      const costBasis = round2(position.avgBuyPrice * o.quantity);
      const pnl = round2(proceeds - costBasis);
      const pnlPercent = costBasis ? round2((pnl / costBasis) * 100) : 0;

      await User.updateOne({ _id: userId }, { $inc: { availableCapital: proceeds } });

      const trade = await Trade.create({
        userId,
        broker: 'paper',
        mode: 'paper',
        symbol: o.symbol,
        action: 'SELL',
        quantity: o.quantity,
        price,
        investmentAmount: proceeds,
        tradeSource: o.source ?? 'manual',
        triggerReason: o.triggerReason ?? '',
        status: 'CLOSED',
        pnl,
        pnlPercent,
        aiDecisionId: o.aiDecisionId ?? null,
        closedAt: new Date(),
      });

      const remaining = position.quantity - o.quantity;
      if (remaining <= 0) {
        await Position.deleteOne({ _id: position._id });
      } else {
        await Position.updateOne(
          { _id: position._id },
          { $inc: { quantity: -o.quantity, investedAmount: -costBasis } },
        );
      }

      return { brokerOrderId: String(trade._id), status: 'FILLED', filledPrice: price, filledQuantity: o.quantity };
    },

    async modifyOrder(orderId, patch) {
      // Paper orders fill synchronously in placeOrder — nothing pending to modify.
      const order = await Order.findById(orderId);
      if (!order) {
        const e = new Error('Paper order not found.');
        e.code = 'ORDER_NOT_FOUND';
        e.status = 404;
        throw e;
      }
      return { brokerOrderId: orderId, status: order.status };
    },

    async cancelOrder(orderId) {
      const order = await Order.findOneAndUpdate(
        { _id: orderId, userId, broker: 'paper', status: { $in: ['PENDING', 'PLACED'] } },
        { status: 'CANCELLED' },
        { new: true },
      );
      if (!order) return { brokerOrderId: orderId, status: 'FILLED' };
      return { brokerOrderId: orderId, status: 'CANCELLED' };
    },

    async getOrderStatus(orderId) {
      const trade = await Trade.findById(orderId).lean();
      if (trade) return { brokerOrderId: orderId, status: 'FILLED', filledPrice: trade.price, filledQuantity: trade.quantity };
      const order = await Order.findById(orderId).lean();
      if (!order) {
        const e = new Error('Paper order not found.');
        e.code = 'ORDER_NOT_FOUND';
        e.status = 404;
        throw e;
      }
      return { brokerOrderId: orderId, status: order.status };
    },

    async getOrderList() {
      const orders = await Order.find({ userId, broker: 'paper' }).sort({ createdAt: -1 }).limit(100).lean();
      return orders.map((o) => ({ brokerOrderId: String(o._id), status: o.status }));
    },

    async getLTP(symbol) {
      return marketData.getLTP(symbol);
    },

    async getLTPBatch(symbols) {
      return marketData.getLTPBatch(symbols);
    },

    async getHoldings() {
      return this.getPositions();
    },

    async getPositions() {
      const positions = await Position.find({ userId, broker: 'paper' }).lean();
      return positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity, avgPrice: p.avgBuyPrice, ltp: 0 }));
    },

    async getMargin() {
      const user = await User.findById(userId).lean();
      return { available: user?.availableCapital ?? 0, used: (user?.startingCapital ?? 0) - (user?.availableCapital ?? 0) };
    },

    async cancelAllOrders() {
      await Order.updateMany(
        { userId, broker: 'paper', status: { $in: ['PENDING', 'PLACED'] } },
        { status: 'CANCELLED' },
      );
    },

    async closeAllPositions() {
      const positions = await Position.find({ userId, broker: 'paper' }).lean();
      for (const p of positions) {
        try {
          await this.placeOrder({ symbol: p.symbol, action: 'SELL', quantity: p.quantity, source: 'automatic', triggerReason: 'kill-switch close-all' });
        } catch (err) {
          console.error(`[PaperBroker] closeAllPositions failed for ${p.symbol}:`, err.message);
        }
      }
    },
  };
}

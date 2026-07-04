import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireLiveConfirm } from '../middleware/requireLiveConfirm.js';
import { placeOrder } from '../services/orderService.js';
import { Order } from '../models/Order.js';
import { brokerFor } from '../services/brokers/registry.js';

export const ordersRoutes = Router();

const PlaceOrderSchema = z.object({
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL']),
  quantity: z.coerce.number().int().positive(),
  orderType: z.enum(['MARKET', 'LIMIT']).optional(),
  price: z.coerce.number().positive().optional(),
  stopLoss: z.coerce.number().positive().optional(),
  target: z.coerce.number().positive().optional(),
  triggerReason: z.string().optional(),
  confirmRealMoney: z.boolean().optional(),
});

ordersRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: orders });
  }),
);

ordersRoutes.post(
  '/',
  requireLiveConfirm,
  validate(PlaceOrderSchema),
  asyncHandler(async (req, res) => {
    const result = await placeOrder(req.userId, { ...req.body, source: 'manual' });
    res.status(201).json({ success: true, data: result });
  }),
);

ordersRoutes.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, userId: req.userId });
    if (!order) {
      const e = new Error('Order not found.');
      e.code = 'ORDER_NOT_FOUND';
      e.status = 404;
      throw e;
    }
    const broker = brokerFor(order.broker, req.userId);
    const result = await broker.cancelOrder(order.brokerOrderId ?? String(order._id));
    order.status = result.status;
    await order.save();
    res.json({ success: true, data: order });
  }),
);

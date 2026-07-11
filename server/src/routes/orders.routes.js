import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireLiveConfirm } from '../middleware/requireLiveConfirm.js';
import { placeOrder } from '../services/orderService.js';
import { Order } from '../models/Order.js';
import { UserSettings } from '../models/UserSettings.js';
import { brokerFor } from '../services/brokers/registry.js';
import { effectiveMode } from '../services/brokers/tradingModeService.js';

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
  aiDecisionId: z.string().optional(),
  confirmRealMoney: z.boolean().optional(),
  // Options — when segment is 'FNO', `symbol` must be the exact option contract trading_symbol
  // (from GET /options/chain); orderService resolves strike/expiry/optionType/lotSize itself
  // from the synced Instrument record, so the client only ever needs to send `segment`.
  segment: z.enum(['CASH', 'FNO']).optional(),
});

ordersRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const localOrders = await Order.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('aiDecisionId', 'confidence reason justification scoreBreakdown')
      .lean();

    const settings = await UserSettings.findOne({ userId: req.userId }).lean();
    const mode = await effectiveMode(req.userId, settings);

    if (mode !== 'live') {
      return res.json({ success: true, data: localOrders });
    }

    // Live mode: the broker's own order list is the source of truth (it also
    // reflects orders placed outside this app, e.g. directly on Groww's own site/app)
    // — merge in local metadata (source, confirmRealMoney, reject
    // reason) by brokerOrderId where we have it, else show broker-only fields.
    const broker = brokerFor(settings.activeBroker, req.userId);
    const localByBrokerId = new Map(localOrders.filter((o) => o.brokerOrderId).map((o) => [o.brokerOrderId, o]));

    let brokerOrders = [];
    try {
      brokerOrders = await broker.getOrderList();
    } catch (err) {
      console.error(`[orders] live getOrderList failed for ${settings.activeBroker}:`, err.message);
      return res.json({ success: true, data: localOrders, warning: `Could not reach ${settings.activeBroker}: ${err.message}` });
    }

    const merged = brokerOrders.map((bo) => {
      const local = localByBrokerId.get(bo.brokerOrderId);
      return {
        _id: local?._id ?? bo.brokerOrderId,
        broker: settings.activeBroker,
        mode: 'live',
        brokerOrderId: bo.brokerOrderId,
        symbol: bo.symbol ?? local?.symbol,
        segment: bo.segment ?? local?.segment ?? 'CASH',
        action: bo.action ?? local?.action,
        quantity: bo.quantity ?? local?.quantity,
        orderType: local?.orderType ?? 'MARKET',
        status: bo.status,
        source: local?.source ?? 'external',
        confirmedRealMoney: local?.confirmedRealMoney ?? true,
        rejectReason: local?.rejectReason ?? '',
        triggerReason: local?.triggerReason ?? '',
        aiDecisionId: local?.aiDecisionId ?? null,
        createdAt: bo.createdAt ?? local?.createdAt ?? null,
      };
    });

    res.json({ success: true, data: merged });
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

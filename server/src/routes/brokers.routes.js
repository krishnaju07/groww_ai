import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { BROKERS } from '../config/constants.js';
import { hasGrowwCredentials, getAccessToken as getGrowwAccessToken } from '../services/brokers/growwAuth.js';
import { UserSettings } from '../models/UserSettings.js';

export const brokersRoutes = Router();

brokersRoutes.get(
  '/status',
  asyncHandler(async (req, res) => {
    const data = {
      paper: { connected: true },
      groww: { connected: hasGrowwCredentials() },
    };
    res.json({ success: true, data });
  }),
);

brokersRoutes.post(
  '/groww/test',
  asyncHandler(async (req, res) => {
    if (!hasGrowwCredentials()) {
      return res.json({ success: true, data: { connected: false, reason: 'No Groww credentials in server .env' } });
    }
    try {
      await getGrowwAccessToken();
      res.json({ success: true, data: { connected: true } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, reason: err.message } });
    }
  }),
);

const ActiveBrokerSchema = z.object({ activeBroker: z.enum(BROKERS) });

brokersRoutes.put(
  '/active',
  validate(ActiveBrokerSchema),
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { activeBroker: req.body.activeBroker },
      { upsert: true, new: true },
    );
    res.json({ success: true, data: settings });
  }),
);

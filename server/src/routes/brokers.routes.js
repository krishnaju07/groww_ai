import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { BROKERS } from '../config/constants.js';
import { hasGrowwCredentials, getAccessToken as getGrowwAccessToken } from '../services/brokers/growwAuth.js';
import { saveCredential, clearCredential, hasValidCredential } from '../services/brokers/credentialStore.js';
import { getAngelOneClient, clearAngelOneSession } from '../services/brokers/angelOneAuth.js';
import { getLoginUrl, completeLogin, clearZerodhaSession } from '../services/brokers/zerodhaAuth.js';
import { UserSettings } from '../models/UserSettings.js';

export const brokersRoutes = Router();

brokersRoutes.get(
  '/status',
  asyncHandler(async (req, res) => {
    const [angeloneOk, zerodhaOk] = await Promise.all([
      hasValidCredential(req.userId, 'angelone'),
      hasValidCredential(req.userId, 'zerodha'),
    ]);
    const data = {
      paper: { connected: true },
      groww: { connected: hasGrowwCredentials() },
      angelone: { connected: angeloneOk },
      zerodha: { connected: zerodhaOk },
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

const AngelOneConnectSchema = z.object({
  apiKey: z.string().min(1),
  clientCode: z.string().min(1),
  password: z.string().min(1),
  totpSecret: z.string().min(1),
});

brokersRoutes.post(
  '/angelone/connect',
  validate(AngelOneConnectSchema),
  asyncHandler(async (req, res) => {
    await saveCredential(req.userId, 'angelone', req.body);
    clearAngelOneSession(req.userId);
    try {
      await getAngelOneClient(req.userId);
      res.json({ success: true, data: { connected: true } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, reason: err.message } });
    }
  }),
);

brokersRoutes.post(
  '/angelone/disconnect',
  asyncHandler(async (req, res) => {
    await clearCredential(req.userId, 'angelone');
    clearAngelOneSession(req.userId);
    res.json({ success: true, data: { connected: false } });
  }),
);

brokersRoutes.get(
  '/zerodha/login-url',
  asyncHandler(async (req, res) => {
    const url = getLoginUrl();
    res.json({ success: true, data: { url } });
  }),
);

brokersRoutes.get(
  '/zerodha/callback',
  asyncHandler(async (req, res) => {
    const requestToken = req.query.request_token;
    if (!requestToken) {
      return res.status(400).send('Missing request_token from Zerodha redirect.');
    }
    await completeLogin(req.userId, String(requestToken));
    res.redirect(`${env.CLIENT_ORIGIN}/brokers?zerodha=connected`);
  }),
);

brokersRoutes.post(
  '/zerodha/disconnect',
  asyncHandler(async (req, res) => {
    await clearCredential(req.userId, 'zerodha');
    clearZerodhaSession(req.userId);
    res.json({ success: true, data: { connected: false } });
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

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { OPTION_UNDERLYINGS } from '../config/constants.js';
import { getExpiries, getOptionChain } from '../services/instruments/instrumentService.js';
import { marketData } from '../services/marketData/index.js';

export const optionsRoutes = Router();

optionsRoutes.get(
  '/underlyings',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: OPTION_UNDERLYINGS });
  }),
);

const UnderlyingQuerySchema = z.object({ underlying: z.string().min(1) });

optionsRoutes.get(
  '/expiries',
  validate(UnderlyingQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const expiries = await getExpiries(req.query.underlying.toUpperCase());
    res.json({ success: true, data: expiries });
  }),
);

const ChainQuerySchema = z.object({ underlying: z.string().min(1), expiry: z.string().min(1) });

optionsRoutes.get(
  '/chain',
  validate(ChainQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const underlying = req.query.underlying.toUpperCase();
    const expiryDate = new Date(req.query.expiry);
    if (Number.isNaN(expiryDate.getTime())) {
      return res.status(400).json({ success: false, error: { message: 'Invalid expiry date.' } });
    }

    const config = OPTION_UNDERLYINGS.find((u) => u.symbol === underlying);
    const [chain, spotPrice] = await Promise.all([
      getOptionChain(underlying, expiryDate),
      config ? marketData.getLTP(config.spotSymbol).catch(() => null) : Promise.resolve(null),
    ]);

    // Chain structure (strike/CE-PE/lotSize) is static instrument data; premiums are
    // fetched live and merged in here so the frontend gets one call for the full picker.
    // A failure here (e.g. no Groww live-data entitlement) is real and worth surfacing —
    // `premiumsUnavailable` lets the UI show "unavailable" instead of a misleading ₹0.00
    // (which, in a live real-money app, could easily be misread as "this option is free").
    const symbols = chain.flatMap((row) => [row.ce?.tradingSymbol, row.pe?.tradingSymbol].filter(Boolean));
    let premiums = {};
    let premiumsUnavailable = false;
    let premiumsUnavailableReason = null;
    if (symbols.length) {
      try {
        premiums = await marketData.getLTPBatch(symbols, 'FNO');
      } catch (err) {
        premiumsUnavailable = true;
        premiumsUnavailableReason = err.message;
        console.error(`[options.routes] premium fetch failed for ${underlying} chain:`, err.message);
      }
    }
    const enrichedChain = chain.map((row) => ({
      strike: row.strike,
      ce: row.ce ? { ...row.ce, premium: premiums[row.ce.tradingSymbol] ?? null } : null,
      pe: row.pe ? { ...row.pe, premium: premiums[row.pe.tradingSymbol] ?? null } : null,
    }));

    res.json({ success: true, data: { chain: enrichedChain, spotPrice, premiumsUnavailable, premiumsUnavailableReason } });
  }),
);

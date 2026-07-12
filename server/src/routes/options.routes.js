import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { OPTION_UNDERLYINGS } from '../config/constants.js';
import { getExpiries, getOptionChain, getAtmStrike } from '../services/instruments/instrumentService.js';
import { marketData } from '../services/marketData/index.js';
import { getChainIntel, getContractGreeks } from '../services/ai/optionIntelService.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

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
    let enrichedChain = chain.map((row) => ({
      strike: row.strike,
      ce: row.ce ? { ...row.ce, premium: premiums[row.ce.tradingSymbol] ?? null } : null,
      pe: row.pe ? { ...row.pe, premium: premiums[row.pe.tradingSymbol] ?? null } : null,
    }));

    // Chain intelligence (PCR/Max Pain/OI) + per-contract greeks — same optionIntelService
    // used by the AI's own decision context (contextBuilder.js), so the UI shows exactly
    // what the AI reasons about. Both degrade to unavailable/null gracefully (no live F&O
    // data feed yet), never throwing — this is a display enrichment, not required data.
    let chainIntel = { available: false };
    if (spotPrice != null) {
      try {
        const atmStrike = await getAtmStrike(underlying, expiryDate, spotPrice);
        const result = await getChainIntel(underlying, expiryDate, spotPrice, atmStrike);
        chainIntel = { available: result.available, ...result.intel };

        if (result.available) {
          const greeksByStrike = new Map(
            await mapWithConcurrency(result.contracts, 6, async (row) => {
              const [ceGreeks, peGreeks] = await Promise.all([
                row.ce?.premium != null
                  ? getContractGreeks({ underlying, tradingSymbol: row.ce.tradingSymbol, expiry: expiryDate, optionType: 'CE', spot: spotPrice, strike: row.strike, premium: row.ce.premium })
                  : null,
                row.pe?.premium != null
                  ? getContractGreeks({ underlying, tradingSymbol: row.pe.tradingSymbol, expiry: expiryDate, optionType: 'PE', spot: spotPrice, strike: row.strike, premium: row.pe.premium })
                  : null,
              ]);
              return [row.strike, { ceGreeks, peGreeks }];
            }),
          );
          enrichedChain = enrichedChain.map((row) => {
            const g = greeksByStrike.get(row.strike);
            if (!g) return row;
            return {
              ...row,
              ce: row.ce ? { ...row.ce, greeks: g.ceGreeks } : null,
              pe: row.pe ? { ...row.pe, greeks: g.peGreeks } : null,
            };
          });
        }
      } catch (err) {
        console.error(`[options.routes] chain intel failed for ${underlying}:`, err.message);
      }
    }

    res.json({ success: true, data: { chain: enrichedChain, spotPrice, premiumsUnavailable, premiumsUnavailableReason, chainIntel } });
  }),
);

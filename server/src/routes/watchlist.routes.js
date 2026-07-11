import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { UserSettings } from '../models/UserSettings.js';
import { OPTION_UNDERLYINGS } from '../config/constants.js';
import { getEquityDetails } from '../services/instruments/instrumentService.js';
import { marketData } from '../services/marketData/index.js';

export const watchlistRoutes = Router();

async function getOrCreateSettings(userId) {
  return UserSettings.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, new: true });
}

/** The user's current focus list, resolved with display name + live LTP — what aiScanJob/autoTradingService iterate. */
watchlistRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await getOrCreateSettings(req.userId);
    const equitySymbols = settings.watchlist.equities;
    const [details, ltps] = await Promise.all([
      getEquityDetails(equitySymbols),
      marketData.getLTPBatch(equitySymbols),
    ]);
    const equities = equitySymbols.map((symbol) => ({
      symbol,
      name: details[symbol]?.name ?? symbol,
      ltp: ltps[symbol] ?? null,
    }));

    const optionUnderlyings = settings.watchlist.optionUnderlyings
      .map((symbol) => OPTION_UNDERLYINGS.find((u) => u.symbol === symbol))
      .filter(Boolean);

    res.json({ success: true, data: { equities, optionUnderlyings } });
  }),
);

const EquitySymbolSchema = z.object({ symbol: z.string().min(1).transform((s) => s.toUpperCase()) });

watchlistRoutes.post(
  '/equities',
  validate(EquitySymbolSchema),
  asyncHandler(async (req, res) => {
    const { symbol } = req.body;
    const [details] = await Promise.all([getEquityDetails([symbol])]);
    if (!details[symbol]) {
      const e = new Error(`Unknown equity symbol: ${symbol}`);
      e.code = 'UNKNOWN_SYMBOL';
      e.status = 400;
      throw e;
    }
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $addToSet: { 'watchlist.equities': symbol } },
      { upsert: true, new: true },
    );
    res.json({ success: true, data: settings.watchlist });
  }),
);

watchlistRoutes.delete(
  '/equities/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $pull: { 'watchlist.equities': symbol } },
      { new: true, upsert: true },
    );
    res.json({ success: true, data: settings.watchlist });
  }),
);

const OptionUnderlyingSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .transform((s) => s.toUpperCase())
    .refine((s) => OPTION_UNDERLYINGS.some((u) => u.symbol === s), 'Unknown option underlying'),
});

watchlistRoutes.post(
  '/options',
  validate(OptionUnderlyingSchema),
  asyncHandler(async (req, res) => {
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $addToSet: { 'watchlist.optionUnderlyings': req.body.symbol } },
      { upsert: true, new: true },
    );
    res.json({ success: true, data: settings.watchlist });
  }),
);

watchlistRoutes.delete(
  '/options/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $pull: { 'watchlist.optionUnderlyings': symbol } },
      { new: true, upsert: true },
    );
    res.json({ success: true, data: settings.watchlist });
  }),
);

import { STOCK_UNIVERSE } from '../../config/constants.js';
import { marketData } from '../marketData/index.js';
import { momentum } from '../indicators.js';
import { round2 } from '../../utils/format.js';

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // `${sector}:${excludeSymbol}` -> {avgMomentum, at}

/** @returns {Promise<number>} average day momentum of `sector`'s peers, excluding `excludeSymbol` itself. */
async function sectorPeerAvgMomentum(sector, excludeSymbol) {
  const cacheKey = `${sector}:${excludeSymbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.avgMomentum;

  const peers = STOCK_UNIVERSE.filter((s) => s.sector === sector && s.symbol !== excludeSymbol);
  const momentums = await Promise.all(
    peers.map(async (p) => {
      try {
        const candles = await marketData.getCandles(p.symbol, '1d', 2);
        return momentum(candles.map((c) => c.close));
      } catch {
        return null;
      }
    }),
  );
  const valid = momentums.filter((m) => m != null);
  const avgMomentum = valid.length ? round2(valid.reduce((s, m) => s + m, 0) / valid.length) : 0;

  cache.set(cacheKey, { avgMomentum, at: Date.now() });
  return avgMomentum;
}

/**
 * How this stock's day momentum compares to its sector peers' average —
 * "is it outperforming or underperforming the stocks around it". For a
 * single-member sector (no peers), returns 0 (no comparison possible) rather
 * than comparing the stock against itself.
 * @param {string} symbol
 * @returns {Promise<{sector:string, sectorAvgMomentum:number, relativeStrength:number}>}
 */
export async function getSectorContext(symbol) {
  const entry = STOCK_UNIVERSE.find((s) => s.symbol === symbol);
  const sector = entry?.sector ?? 'Other';

  const hasPeers = STOCK_UNIVERSE.some((s) => s.sector === sector && s.symbol !== symbol);
  if (!hasPeers) return { sector, sectorAvgMomentum: 0, relativeStrength: 0 };

  const candles = await marketData.getCandles(symbol, '1d', 2);
  const ownMomentum = momentum(candles.map((c) => c.close));
  const sectorAvg = await sectorPeerAvgMomentum(sector, symbol);

  return {
    sector,
    sectorAvgMomentum: sectorAvg,
    relativeStrength: round2(ownMomentum - sectorAvg),
  };
}

/**
 * Bridges live Groww F&O quote/greeks data to the pure-math intelligence engines
 * (optionChainIntelligence.js, optionGreeks.js). This is the "activates when the data
 * subscription is live" layer: every fetch is wrapped so a missing entitlement degrades
 * to a partial/`available:false` result instead of throwing up the stack. Greeks have a
 * Black-Scholes fallback, so they work from premium + spot + expiry alone even if Groww's
 * dedicated greeks endpoint isn't entitled.
 */
import { GrowwProvider } from '../marketData/GrowwProvider.js';
import { getOptionChain } from '../instruments/instrumentService.js';
import { analyzeChain, liquidityOf } from './optionChainIntelligence.js';
import { greeks as bsGreeks, impliedVol, yearsToExpiry } from './optionGreeks.js';
import { mapWithConcurrency } from '../../utils/concurrency.js';

const QUOTE_CONCURRENCY = 6;

/**
 * Fetches quotes for the ATM±window strikes of an underlying's expiry and derives the
 * chain intelligence (PCR / max pain / OI levels / liquidity). Never throws — a data
 * outage yields `{ available:false, ... }`.
 * @param {string} underlying @param {Date} expiry @param {number} spotPrice @param {number} atmStrike
 * @param {number} [windowStrikes] how many strikes each side of ATM to include (keeps the quote fan-out bounded)
 * @returns {Promise<{available:boolean, intel:object, contracts:object[]}>}
 */
export async function getChainIntel(underlying, expiry, spotPrice, atmStrike, windowStrikes = 5) {
  let chain;
  try {
    chain = await getOptionChain(underlying, expiry);
  } catch (err) {
    console.error(`[optionIntel] getOptionChain failed for ${underlying}:`, err.message);
    return { available: false, intel: analyzeChain([], spotPrice), contracts: [] };
  }

  // Restrict to a window around ATM — no point pulling quotes for far-OTM wings the AI
  // will never trade, and it bounds the per-tick quote fan-out.
  const sorted = chain.filter((c) => c.ce || c.pe).sort((a, b) => Math.abs(a.strike - atmStrike) - Math.abs(b.strike - atmStrike));
  const windowRows = sorted.slice(0, windowStrikes * 2 + 1).sort((a, b) => a.strike - b.strike);

  const quoted = await mapWithConcurrency(windowRows, QUOTE_CONCURRENCY, async (row) => {
    const [ce, pe] = await Promise.all([fetchSideQuote(row.ce), fetchSideQuote(row.pe)]);
    return { strike: row.strike, ce, pe };
  });

  const intel = analyzeChain(quoted, spotPrice);
  const contracts = quoted.map((row) => ({
    strike: row.strike,
    ce: row.ce ? { ...row.ce, liquidity: liquidityOf(row.ce) } : null,
    pe: row.pe ? { ...row.pe, liquidity: liquidityOf(row.pe) } : null,
  }));
  return { available: intel.available, intel, contracts };
}

/** @param {{tradingSymbol:string}|null} side @returns {Promise<object|null>} the parsed quote (premium/oi/iv/…) or null on failure/absence */
async function fetchSideQuote(side) {
  if (!side?.tradingSymbol) return null;
  try {
    const q = await GrowwProvider.getQuote(side.tradingSymbol, 'FNO');
    return {
      tradingSymbol: side.tradingSymbol,
      premium: q.lastPrice,
      oi: q.oi,
      oiChange: q.oiChange,
      volume: q.volume,
      iv: q.iv,
      bidPrice: q.bidPrice,
      askPrice: q.askPrice,
    };
  } catch {
    // Expected when the F&O data feed isn't entitled — degrade this side to null.
    return null;
  }
}

/**
 * Greeks for one contract — Groww's dedicated endpoint first, Black-Scholes fallback
 * (IV solved from the premium) when that's unavailable. Returns null only when even the
 * fallback can't run (no premium/spot/expiry).
 * @param {{underlying:string, tradingSymbol:string, expiry:Date, optionType:'CE'|'PE', spot:number, strike:number, premium:number|null}} c
 * @returns {Promise<{delta:number, gamma:number, theta:number, vega:number, rho:number, iv:number|null, source:'groww'|'blackscholes'}|null>}
 */
export async function getContractGreeks(c) {
  const expiryStr = new Date(c.expiry).toISOString().slice(0, 10);
  try {
    const g = await GrowwProvider.getGreeks(c.underlying, c.tradingSymbol, expiryStr);
    if (g.delta != null) return { ...g, source: 'groww' };
  } catch {
    // fall through to Black-Scholes
  }

  // Fallback: solve IV from the market premium, then compute greeks analytically.
  if (!Number.isFinite(c.spot) || !Number.isFinite(c.strike) || !Number.isFinite(c.premium) || c.premium <= 0) return null;
  const T = yearsToExpiry(c.expiry);
  const iv = impliedVol(c.optionType, c.premium, c.spot, c.strike, T);
  if (iv == null) return null;
  return { ...bsGreeks(c.optionType, c.spot, c.strike, T, iv), iv: Math.round(iv * 10000) / 100, source: 'blackscholes' };
}

import { env } from '../../config/env.js';
import {
  STOCK_UNIVERSE,
  PRICE_CACHE_TTL_MS,
  HISTORY_CACHE_TTL_MS,
} from '../../config/constants.js';
import StockPrice from '../../models/StockPrice.js';
import { YahooFinanceProvider } from './YahooFinanceProvider.js';
import { GrowwProvider } from './GrowwProvider.js';
import { AlphaVantageProvider } from './AlphaVantageProvider.js';
import { MockProvider } from './MockProvider.js';

/**
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {import('../../types.js').Candle} Candle
 * @typedef {import('./MarketDataProvider.js').MarketDataProvider} MarketDataProvider
 */

/**
 * Construct the primary provider from the env selection. Unknown values fall
 * back to Yahoo.
 *
 * @param {string} name
 * @returns {MarketDataProvider}
 */
function buildPrimaryProvider(name) {
  switch (name) {
    case 'groww':
      return new GrowwProvider();
    case 'alphavantage':
      return new AlphaVantageProvider();
    case 'mock':
      return new MockProvider();
    case 'yahoo':
    default:
      return new YahooFinanceProvider();
  }
}

/**
 * Market-data facade: selects a primary provider from env, transparently falls
 * back to the deterministic mock provider on ANY primary error (so the app
 * always works offline / without a Groww subscription), and caches quotes and
 * history in-memory with TTLs.
 */
export class MarketDataService {
  constructor() {
    /** @type {MarketDataProvider} */
    this.primary = buildPrimaryProvider(env.MARKET_DATA_PROVIDER);
    /** @type {MockProvider} */
    this.fallback = new MockProvider();

    /** @type {Map<string,{at:number,quote:StockQuote}>} */
    this.quoteCache = new Map();
    /** @type {Map<string,{at:number,candles:Candle[]}>} */
    this.historyCache = new Map();
  }

  /**
   * Name of the configured primary provider.
   * @returns {string}
   */
  get providerName() {
    return this.primary.name;
  }

  /**
   * Best-effort, non-blocking upsert of a quote snapshot into StockPrice.
   * Never throws or blocks the caller.
   *
   * @param {StockQuote} quote
   * @returns {void}
   */
  persistQuote(quote) {
    StockPrice.updateOne(
      { symbol: quote.symbol },
      {
        $set: {
          symbol: quote.symbol,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          previousClose: quote.previousClose,
          volume: quote.volume,
          timestamp: quote.timestamp,
        },
      },
      { upsert: true },
    )
      .exec()
      .catch(() => {
        /* best-effort: ignore persistence errors */
      });
  }

  /**
   * Fetch a live quote for a canonical symbol (cached for PRICE_CACHE_TTL_MS).
   * Falls back to the mock provider if the primary throws.
   *
   * @param {string} symbol canonical symbol
   * @returns {Promise<StockQuote>}
   */
  async getQuote(symbol) {
    const cached = this.quoteCache.get(symbol);
    const now = Date.now();
    if (cached && now - cached.at < PRICE_CACHE_TTL_MS) {
      return cached.quote;
    }

    let quote;
    try {
      quote = await this.primary.getQuote(symbol);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[marketData] primary (${this.primary.name}) getQuote failed for ${symbol}, falling back to mock: ${err.message}`,
      );
      quote = await this.fallback.getQuote(symbol);
    }

    this.quoteCache.set(symbol, { at: now, quote });
    this.persistQuote(quote);
    return quote;
  }

  /**
   * Fetch daily OHLCV history (cached for HISTORY_CACHE_TTL_MS).
   * Falls back to the mock provider if the primary throws.
   *
   * @param {string} symbol canonical symbol
   * @param {number} [days=30]
   * @returns {Promise<Candle[]>}
   */
  async getHistory(symbol, days = 30) {
    const key = `${symbol}:${days}`;
    const cached = this.historyCache.get(key);
    const now = Date.now();
    if (cached && now - cached.at < HISTORY_CACHE_TTL_MS) {
      return cached.candles;
    }

    let candles;
    try {
      candles = await this.primary.getHistory(symbol, days);
      if (!Array.isArray(candles) || candles.length === 0) {
        throw new Error('empty history');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[marketData] primary (${this.primary.name}) getHistory failed for ${symbol}, falling back to mock: ${err.message}`,
      );
      candles = await this.fallback.getHistory(symbol, days);
    }

    this.historyCache.set(key, { at: now, candles });
    return candles;
  }

  /**
   * Fetch quotes for the entire universe with per-symbol fallback.
   *
   * @returns {Promise<StockQuote[]>}
   */
  async getAllQuotes() {
    const results = await Promise.allSettled(
      STOCK_UNIVERSE.map((s) => this.getQuote(s.symbol)),
    );
    /** @type {StockQuote[]} */
    const quotes = [];
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        quotes.push(r.value);
      } else {
        // Last-resort per-symbol fallback so the list is always complete.
        // eslint-disable-next-line no-await-in-loop
        const q = await this.fallback.getQuote(STOCK_UNIVERSE[i].symbol);
        this.persistQuote(q);
        quotes.push(q);
      }
    }
    return quotes;
  }
}

/** Singleton market-data service. */
export const marketData = new MarketDataService();

export default marketData;

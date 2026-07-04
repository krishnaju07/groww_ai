/**
 * @typedef {Object} Candle
 * @property {Date} time
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 */

/**
 * Contract every market-data provider implements.
 * @typedef {Object} MarketDataProvider
 * @property {string} name
 * @property {(symbol: string) => Promise<number>} getLTP
 * @property {(symbols: string[]) => Promise<Record<string, number>>} getLTPBatch
 * @property {(symbol: string, interval: '1m'|'5m'|'15m'|'30m'|'1d', limit?: number) => Promise<Candle[]>} getCandles
 */

export {};

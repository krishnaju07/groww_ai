export const DEFAULT_USER_ID = 'default-user';

/** Curated NSE universe the app tracks/trades. Symbols are NSE trading symbols (no exchange suffix). `sector` powers sector-relative-strength context for the AI decision engine (sectorContext.js). */
export const STOCK_UNIVERSE = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', segment: 'CASH', sector: 'Energy' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', segment: 'CASH', sector: 'IT' },
  { symbol: 'INFY', name: 'Infosys', exchange: 'NSE', segment: 'CASH', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', exchange: 'NSE', segment: 'CASH', sector: 'Banking' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', exchange: 'NSE', segment: 'CASH', sector: 'Banking' },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', segment: 'CASH', sector: 'Banking' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', exchange: 'NSE', segment: 'CASH', sector: 'Auto' },
  { symbol: 'ITC', name: 'ITC Limited', exchange: 'NSE', segment: 'CASH', sector: 'FMCG' },
  { symbol: 'AXISBANK', name: 'Axis Bank', exchange: 'NSE', segment: 'CASH', sector: 'Banking' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', exchange: 'NSE', segment: 'CASH', sector: 'Telecom' },
  { symbol: 'WIPRO', name: 'Wipro', exchange: 'NSE', segment: 'CASH', sector: 'IT' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', exchange: 'NSE', segment: 'CASH', sector: 'FMCG' },
];

export const NIFTY_INDEX_SYMBOL = 'NIFTY 50';

/** Broker identifiers used across UserSettings.activeBroker, BrokerCredential.broker, Trade/Order/Position.broker. */
export const BROKERS = /** @type {const} */ (['paper', 'groww', 'zerodha', 'angelone']);

/** Trading modes. */
export const TRADING_MODES = /** @type {const} */ (['paper', 'live']);

/** Order/trade action side. */
export const ACTIONS = /** @type {const} */ (['BUY', 'SELL']);

/** AI decision actions (WAIT = no trade proposed). */
export const AI_ACTIONS = /** @type {const} */ (['BUY', 'SELL', 'WAIT']);

/** LLM providers the decision engine can call — switchable live from Settings. */
export const AI_PROVIDERS = /** @type {const} */ (['claude', 'openai']);

/** Market-data providers — switchable live from Settings (UserSettings.systemConfig.marketDataProvider). */
export const MARKET_DATA_PROVIDERS = /** @type {const} */ (['yahoo', 'groww', 'alphavantage', 'mock']);

export const ORDER_STATUSES = /** @type {const} */ ([
  'PENDING',
  'PLACED',
  'FILLED',
  'PARTIALLY_FILLED',
  'CANCELLED',
  'REJECTED',
]);

export const TRADE_SOURCES = /** @type {const} */ (['manual', 'automatic', 'ai']);

/** Conservative defaults seeded for a brand-new user's RiskConfig. */
export const DEFAULT_RISK_CONFIG = {
  maxLossPerDay: 2000,
  maxLossPerTrade: 500,
  maxTradesPerDay: 10,
  maxCapitalPerTradePercent: 5,
  dailyProfitLockPercent: 2,
  killSwitchEngaged: false,
};

export const DEFAULT_STARTING_CAPITAL = 100000;

// --- Groww Trade API (market data + order execution) ---
export const GROWW_BASE_URL = 'https://api.groww.in/v1';
export const GROWW_API_VERSION = '1.0';
export const GROWW_ORDER = {
  PRODUCT_CNC: 'CNC',
  PRODUCT_MIS: 'MIS',
  VALIDITY_DAY: 'DAY',
  ORDER_TYPE_MARKET: 'MARKET',
  ORDER_TYPE_LIMIT: 'LIMIT',
  TRANSACTION_BUY: 'BUY',
  TRANSACTION_SELL: 'SELL',
  EXCHANGE_NSE: 'NSE',
  SEGMENT_CASH: 'CASH',
};

// --- Indicator knobs fed into the AI context builder ---
export const INDICATOR_CONFIG = {
  rsiPeriod: 14,
  macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  volumeAvgWindow: 20,
  trendWindowShort: 5,
  trendWindowLong: 15,
  pivotWindow: 20,
};

/** Simulated fill slippage for PaperBroker (fraction of price). */
export const PAPER_SLIPPAGE = 0.0005;

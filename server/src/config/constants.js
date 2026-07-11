export const DEFAULT_USER_ID = 'default-user';

/**
 * Curated seed list — the default watchlist a brand-new user starts with (see
 * UserSettings.watchlist.equities). The actual browsable/tradeable stock universe is
 * the full real NSE equity list synced from Groww's instrument CSV (~2,300+ stocks,
 * see instrumentSync.js/instrumentService.searchEquities) — this list ONLY seeds
 * defaults and provides `sector` for sectorContext.js's relative-strength calc (any
 * stock outside this list falls back to sector 'Other', see sectorContext.js).
 */
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

/**
 * The full browsable/tradeable index-options universe (verified against Groww's real
 * instrument CSV and each spot symbol's live data source — see YahooFinanceProvider's
 * yahooSymbol() map). A user's actual auto-trading FOCUS is a subset of this, stored in
 * UserSettings.watchlist.optionUnderlyings (default: just NIFTY) — this constant is the
 * complete set they can choose from, not what gets auto-scanned.
 * `spotSymbol` is the underlying index symbol used to fetch its own technicals
 * (contextBuilder reuses the equity indicator pipeline against this); `growwUnderlyingSymbol`
 * is the `underlying_symbol` value used to filter Groww's instrument CSV for this
 * underlying's option chain (see instrumentSync.js / instrumentService.js).
 * Index F&O also exists for MIDCPNIFTY/NIFTYNXT50/SENSEX/BANKEX on Groww's instrument
 * master, but they're left out here until their spot-data source (Yahoo ticker or
 * equivalent) is verified — adding one is just adding another entry below.
 */
export const OPTION_UNDERLYINGS = [
  { symbol: 'NIFTY', name: 'Nifty 50', growwUnderlyingSymbol: 'NIFTY', spotSymbol: 'NIFTY 50' },
  { symbol: 'BANKNIFTY', name: 'Bank Nifty', growwUnderlyingSymbol: 'BANKNIFTY', spotSymbol: 'NIFTY BANK' },
  { symbol: 'FINNIFTY', name: 'Nifty Financial Services', growwUnderlyingSymbol: 'FINNIFTY', spotSymbol: 'NIFTY FIN SERVICE' },
];

export const OPTION_TYPES = /** @type {const} */ (['CE', 'PE']);

export const INSTRUMENT_TYPES = /** @type {const} */ (['EQ', 'FUT', 'OPT']);

/** Broker identifiers used across UserSettings.activeBroker, Trade/Order/Position.broker. Paper (simulation) and Groww (the only live broker this platform integrates with) are the only two. */
export const BROKERS = /** @type {const} */ (['paper', 'groww']);

/** Trading modes. */
export const TRADING_MODES = /** @type {const} */ (['paper', 'live']);

/** Order/trade action side. */
export const ACTIONS = /** @type {const} */ (['BUY', 'SELL']);

/** AI decision actions (WAIT = no trade proposed). */
export const AI_ACTIONS = /** @type {const} */ (['BUY', 'SELL', 'WAIT']);

/**
 * LLM providers the decision engine can call — switchable live from Settings.
 * 'claude' uses the Anthropic SDK directly; the rest are all called through the
 * OpenAI SDK pointed at each provider's own OpenAI-compatible endpoint (see
 * decisionEngine.js's makeOpenAICompatProvider) — no extra SDK per provider needed.
 */
export const AI_PROVIDERS = /** @type {const} */ (['claude', 'openai', 'gemini', 'grok', 'perplexity']);

/**
 * Curated cheap/balanced/flagship model choices per provider, shown as a dropdown in
 * Settings (UserSettings.aiModel overrides the provider's env-configured default model
 * when set). NOT exhaustive and NOT validated server-side against this list (a provider
 * can ship a new model before this is updated, and a user may want to type a model id
 * that isn't listed here) — this is a curation aid, not a hard constraint.
 * Verified against each provider's pricing pages as of mid-2026; provider lineups move
 * fast, so treat "cheapest"/"flagship" labels as directional, not permanent.
 */
export const AI_MODEL_OPTIONS = {
  claude: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — cheapest' },
    { value: 'claude-sonnet-5', label: 'Sonnet 5 — balanced' },
    { value: 'claude-opus-4-8', label: 'Opus 4.8 — most capable' },
  ],
  openai: [
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano — cheapest' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini — balanced' },
    { value: 'gpt-5.4', label: 'GPT-5.4 — most capable' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash-lite', label: 'Flash Lite — cheapest' },
    { value: 'gemini-2.5-flash', label: 'Flash — balanced' },
    { value: 'gemini-2.5-pro', label: 'Pro — most capable' },
  ],
  grok: [
    { value: 'grok-4.1-fast', label: 'Grok 4.1 Fast — cheapest' },
    { value: 'grok-4.3', label: 'Grok 4.3 — balanced' },
    { value: 'grok-4.5', label: 'Grok 4.5 — most capable' },
  ],
  perplexity: [
    { value: 'sonar', label: 'Sonar — cheapest' },
    { value: 'sonar-pro', label: 'Sonar Pro — balanced' },
    { value: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro — most capable' },
  ],
};

/**
 * Market-data providers — switchable live from Settings (UserSettings.systemConfig.marketDataProvider).
 * 'mock' is not a third-party integration — it's a local synthetic-data generator with zero
 * external calls, used only as marketData/index.js's internal fail-safe fallback (and,
 * transparently labeled "offline", as an optional manual pick for dev/testing outside market
 * hours) — it never activates while trading Live. 'groww' currently has no working live-data
 * entitlement on this account (see GrowwProvider.js) but stays selectable for when it does.
 */
export const MARKET_DATA_PROVIDERS = /** @type {const} */ (['yahoo', 'groww', 'mock']);

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
/** Static instrument master (all NSE cash + F&O contracts, no auth required) — instrumentSync.js's sole data source; there is no dynamic option-chain/search API. */
export const GROWW_INSTRUMENTS_CSV_URL = 'https://growwapi-assets.groww.in/instruments/instrument.csv';
export const GROWW_ORDER = {
  PRODUCT_CNC: 'CNC',
  PRODUCT_MIS: 'MIS',
  VALIDITY_DAY: 'DAY',
  ORDER_TYPE_MARKET: 'MARKET',
  ORDER_TYPE_LIMIT: 'LIMIT',
  ORDER_TYPE_SL_M: 'SL_M',
  TRANSACTION_BUY: 'BUY',
  TRANSACTION_SELL: 'SELL',
  EXCHANGE_NSE: 'NSE',
  SEGMENT_CASH: 'CASH',
  SEGMENT_FNO: 'FNO',
  PRODUCT_NRML: 'NRML',
  // Smart Orders (GTT/OCO) — /order-advance/* endpoints, used to place a broker-side
  // stop-loss/target safety net alongside positionGuardianJob's own polling.
  SMART_ORDER_TYPE_GTT: 'GTT',
  SMART_ORDER_TYPE_OCO: 'OCO',
  TRIGGER_DIRECTION_UP: 'UP',
  TRIGGER_DIRECTION_DOWN: 'DOWN',
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

// gtsym = Groww trading_symbol; gesym = Groww exchange_symbol (ltp/ohlc); gexch = exchange; gseg = segment.
export const STOCK_UNIVERSE = [
  { symbol: 'RELIANCE',  name: 'Reliance Industries',   yahoo: 'RELIANCE.NS', alpha: 'RELIANCE.BSE', gtsym: 'RELIANCE',   gesym: 'NSE_RELIANCE',   gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'TCS',       name: 'Tata Consultancy Svcs',  yahoo: 'TCS.NS',      alpha: 'TCS.BSE',       gtsym: 'TCS',        gesym: 'NSE_TCS',        gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'HDFCBANK',  name: 'HDFC Bank',              yahoo: 'HDFCBANK.NS', alpha: 'HDFCBANK.BSE',  gtsym: 'HDFCBANK',   gesym: 'NSE_HDFCBANK',   gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'INFY',      name: 'Infosys',                yahoo: 'INFY.NS',     alpha: 'INFY.BSE',      gtsym: 'INFY',       gesym: 'NSE_INFY',       gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'SBIN',      name: 'State Bank of India',    yahoo: 'SBIN.NS',     alpha: 'SBIN.BSE',      gtsym: 'SBIN',       gesym: 'NSE_SBIN',       gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'WIPRO',     name: 'Wipro',                  yahoo: 'WIPRO.NS',    alpha: 'WIPRO.BSE',     gtsym: 'WIPRO',      gesym: 'NSE_WIPRO',      gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank',             yahoo: 'ICICIBANK.NS',alpha: 'ICICIBANK.BSE', gtsym: 'ICICIBANK',  gesym: 'NSE_ICICIBANK',  gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'BAJFINANCE',name: 'Bajaj Finance',          yahoo: 'BAJFINANCE.NS',alpha:'BAJFINANCE.BSE', gtsym: 'BAJFINANCE', gesym: 'NSE_BAJFINANCE', gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'MARUTI',    name: 'Maruti Suzuki',          yahoo: 'MARUTI.NS',   alpha: 'MARUTI.BSE',    gtsym: 'MARUTI',     gesym: 'NSE_MARUTI',     gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'TATAMOTORS',name: 'Tata Motors',            yahoo: 'TATAMOTORS.NS',alpha:'TATAMOTORS.BSE', gtsym: 'TATAMOTORS', gesym: 'NSE_TATAMOTORS', gexch: 'NSE', gseg: 'CASH' },
  { symbol: 'NIFTY50',   name: 'Nifty 50 Index',         yahoo: '^NSEI',       alpha: '',              gtsym: 'NIFTY',      gesym: 'NSE_NIFTY',      gexch: 'NSE', gseg: 'CASH' },
];

export const GROWW_BASE_URL = 'https://api.groww.in/v1';
export const GROWW_API_VERSION = '1.0';

// Defaults for LIVE order placement via the Groww order API.
export const GROWW_ORDER = { exchange: 'NSE', segment: 'CASH', product: 'CNC', orderType: 'MARKET', validity: 'DAY' };
export const TRADING_MODES = ['paper', 'live'];

export const DEFAULT_USER_ID = '650000000000000000000001'; // fixed ObjectId hex
export const DEFAULT_USER = { name: 'Demo Trader', email: 'demo@groww.ai', initialCapital: 1_000_000 };

export const DEFAULT_SETTINGS = {
  minInvestment: 5_000,
  maxInvestment: 50_000,
  tradingMode: 'paper',
  autoInvest: { enabled: true, minConfidenceScore: 75 },
  autoExit: { enabled: true, stopLossPercent: 2.5, takeProfitPercent: 5, trailingStopPercent: 1.5, useAiExitSignal: true },
};

export const SLIPPAGE_MIN = 0.001; // 0.1%
export const SLIPPAGE_MAX = 0.003; // 0.3%

export const VALIDATION = {
  minInvestmentFloor: 500,
  stopLoss:   { min: 0.5, max: 20 },
  takeProfit: { min: 0.5, max: 50 },
  trailing:   { min: 0,   max: 10 },
  confidence: { min: 0,   max: 100 },
};

export const INDICATORS = { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma20: 20, sma50: 50, momentumWindow: 10, volumeAvgWindow: 20 };
export const SIGNAL = { buyThreshold: 20, sellThreshold: -20 };

export const PRICE_CACHE_TTL_MS = 15_000;
export const HISTORY_CACHE_TTL_MS = 5 * 60_000;
export const AUTO_TRADING_CRON = '*/30 * * * * *'; // every 30s

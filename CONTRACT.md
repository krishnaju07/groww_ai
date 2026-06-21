# GrowwAI — Build Contract (Single Source of Truth) — **JavaScript edition**

> Every code-generating agent MUST read this file in full and follow it EXACTLY.
> Do not invent names, endpoints, constants, store APIs, service signatures, or
> component props that differ from what is written here. If something is unspecified,
> choose the simplest option consistent with the conventions below.

A production-grade **AI-Powered Stock Trading Assistant** (Groww-style, Indian equities,
**paper trading only**). Monorepo: `client/` (Vite + React 18 + **JavaScript/JSX** + Tailwind +
Zustand + Recharts + lucide-react) and `server/` (Node 18+ + Express + **JavaScript/ESM** +
Mongoose + node-cron + zod). **No TypeScript anywhere.**

---

## 0. Global Conventions

- **Language:** modern JavaScript (ES2022), **ESM modules** in BOTH packages (`"type": "module"` in each `package.json`). Use `import`/`export`, never `require`.
- **Server file extensions:** `.js`. With Node ESM, **all relative imports MUST include the `.js` extension** (e.g. `import { env } from './config/env.js'`). This applies to every server relative import.
- **Client file extensions:** `.jsx` for any file containing JSX (components, pages, `App`, `main`); `.js` for plain modules (stores, services, hooks, lib, types). Vite resolves extensionless relative imports — extensions optional on the client.
- **Types:** no TypeScript. Document shared domain shapes as **JSDoc `@typedef`** in `*/src/types.js` (see §1). Service/store functions SHOULD carry a short JSDoc (`@param`/`@returns`) referencing those typedefs for editor intellisense, but this is documentation only — nothing is type-checked.
- **No `// TODO`, no `...` placeholders, no stubs** — every file is complete and runnable.
- **No business logic in route handlers** — handlers validate + call a service + send the response. All logic lives in `services/`.
- **Every async route** is wrapped in `asyncHandler`. A global error middleware returns `{ success: false, error, code }`.
- **All successful API responses** are wrapped: `{ success: true, data }`.
- **INR formatting:** `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })`. Shared helper `formatINR(n)`.
- **Money/qty:** quantities are integers (whole shares); prices/amounts rounded to 2 decimals at boundaries. NIFTY50 is treated as a tradable instrument; `quantity = Math.floor(investmentAmount / price)` (no fractional shares).
- **Dark theme**, accent green `#00C853`, professional trading-terminal aesthetic.
- **JSDoc** on every exported service function. Inline comments only on non-obvious logic. Match surrounding idiom; concise.

---

## 1. Shared Domain Shapes (JSDoc)

`server/src/types.js` and `client/src/types.js` MUST contain this block **verbatim and identical** (copy exactly). The file ends with `export {};` so it is a valid ESM module. These shapes are the DTOs crossing the API.

```js
/**
 * @typedef {'BUY'|'SELL'|'HOLD'} SignalType
 * @typedef {'BUY'|'SELL'} TradeAction
 * @typedef {'manual'|'automatic'} TradeType
 * @typedef {'OPEN'|'CLOSED'} TradeStatus
 *
 * @typedef {Object} StockQuote
 * @property {string} symbol         canonical e.g. "RELIANCE", "NIFTY50"
 * @property {string} name
 * @property {number} price
 * @property {number} change          absolute vs previousClose
 * @property {number} changePercent
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} previousClose
 * @property {number} volume
 * @property {string} timestamp       ISO
 *
 * @typedef {Object} Candle
 * @property {string} date            "YYYY-MM-DD"
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 *
 * @typedef {Object} SignalIndicators
 * @property {number} rsi             0..100
 * @property {number} macd            histogram = MACD line - signal line
 * @property {number} momentum        % change over momentum window
 * @property {number} volumeRatio     current volume / avg(volume,20)
 * @property {number} sma20
 * @property {number} sma50
 *
 * @typedef {Object} AISignal
 * @property {string} symbol
 * @property {SignalType} signal
 * @property {number} confidence      0..100
 * @property {string} reason
 * @property {SignalIndicators} indicators
 * @property {string} generatedAt     ISO
 *
 * @typedef {Object} Trade
 * @property {string} id
 * @property {string} symbol
 * @property {TradeAction} action
 * @property {number} quantity
 * @property {number} price            execution price (incl. slippage)
 * @property {number} investmentAmount
 * @property {TradeType} tradeType
 * @property {string} [triggerReason]
 * @property {TradeStatus} status
 * @property {number} [pnl]
 * @property {number} [pnlPercent]
 * @property {string} openedAt         ISO
 * @property {string} [closedAt]       ISO
 *
 * @typedef {Object} Position
 * @property {string} id
 * @property {string} symbol
 * @property {number} quantity
 * @property {number} avgBuyPrice
 * @property {number} currentPrice
 * @property {number} investedAmount
 * @property {number} currentValue
 * @property {number} unrealizedPnl
 * @property {number} unrealizedPnlPercent
 * @property {number} highestPriceSeen
 * @property {string} openedAt         ISO
 *
 * @typedef {Object} AutoInvestSettings
 * @property {boolean} enabled
 * @property {number} minConfidenceScore   0..100
 * @property {string} [lastExecutedAt]     ISO
 *
 * @typedef {Object} AutoExitSettings
 * @property {boolean} enabled
 * @property {number} stopLossPercent      0.5..20
 * @property {number} takeProfitPercent    0.5..50
 * @property {number} trailingStopPercent  0..10, 0 = disabled
 * @property {boolean} useAiExitSignal
 *
 * @typedef {Object} UserSettings
 * @property {string} userId
 * @property {number} minInvestment
 * @property {number} maxInvestment
 * @property {AutoInvestSettings} autoInvest
 * @property {AutoExitSettings} autoExit
 * @property {string} updatedAt            ISO
 *
 * @typedef {Object} PortfolioSummary
 * @property {number} cashBalance
 * @property {number} investedValue        sum investedAmount of OPEN positions
 * @property {number} currentValue         sum currentValue of OPEN positions
 * @property {number} totalValue           cashBalance + currentValue
 * @property {number} totalPnl             realizedPnl + unrealized of open positions
 * @property {number} totalPnlPercent      totalPnl / initialCapital * 100
 * @property {number} dayPnl               sum (price-previousClose)*qty over open positions
 * @property {number} dayPnlPercent
 * @property {number} realizedPnl
 *
 * @typedef {Object} PortfolioResponse
 * @property {PortfolioSummary} summary
 * @property {Position[]} positions
 *
 * @typedef {Object} EquityPoint
 * @property {string} date                 ISO
 * @property {number} value
 *
 * @typedef {Object} DashboardData
 * @property {PortfolioSummary} summary
 * @property {EquityPoint[]} equityCurve
 * @property {AISignal[]} topSignals       top 3 by confidence (BUY/SELL preferred over HOLD)
 * @property {Trade[]} recentTrades        last 10
 * @property {{enabled:boolean,lastTrade?:{symbol:string,investmentAmount:number,at:string}}} autoInvest
 * @property {{enabled:boolean,activeRules:number}} autoExit
 *
 * @typedef {Object} BacktestParams
 * @property {string} symbol
 * @property {string} startDate            "YYYY-MM-DD"
 * @property {string} endDate              "YYYY-MM-DD"
 * @property {number} initialCapital
 * @property {number} perTradeAmount
 * @property {number} minConfidenceScore
 * @property {number} stopLossPercent
 * @property {number} takeProfitPercent
 * @property {number} trailingStopPercent
 *
 * @typedef {Object} BacktestTrade
 * @property {string} symbol
 * @property {TradeAction} action
 * @property {string} date                 "YYYY-MM-DD"
 * @property {number} price
 * @property {number} quantity
 * @property {number} [pnl]
 * @property {number} [pnlPercent]
 * @property {string} reason
 *
 * @typedef {Object} BacktestResult
 * @property {string} id
 * @property {BacktestParams} params
 * @property {number} totalReturnPercent
 * @property {number} finalCapital
 * @property {number} maxDrawdownPercent
 * @property {number} winRate              0..100
 * @property {number} totalTrades
 * @property {number} sharpeRatio
 * @property {EquityPoint[]} equityCurve
 * @property {BacktestTrade[]} trades
 * @property {string} createdAt            ISO
 */
export {};
```

---

## 2. Constants (`server/src/config/constants.js`)

```js
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

export const DEFAULT_USER_ID = '650000000000000000000001'; // fixed ObjectId hex
export const DEFAULT_USER = { name: 'Demo Trader', email: 'demo@groww.ai', initialCapital: 1_000_000 };

export const DEFAULT_SETTINGS = {
  minInvestment: 5_000,
  maxInvestment: 50_000,
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
```

**Slippage rule:** BUY fills at `price * (1 + slip)`, SELL fills at `price * (1 - slip)`, `slip = random in [SLIPPAGE_MIN, SLIPPAGE_MAX]`. Apply in `tradeService` only.

---

## 3. Environment

**`server/.env.example`**
```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/groww_ai
CLIENT_ORIGIN=http://localhost:5173
MARKET_DATA_PROVIDER=yahoo        # yahoo | groww | alphavantage | mock  (default yahoo: free, no key)
ALPHA_VANTAGE_API_KEY=            # required only if provider=alphavantage
GROWW_ACCESS_TOKEN=              # required only if provider=groww (Groww Trade API, ₹499/mo)
GROWW_API_KEY=                   # optional: OAuth2 token generation (v2 live trading)
GROWW_API_SECRET=                # optional: OAuth2 token generation (v2 live trading)
IGNORE_MARKET_HOURS=true          # true = auto-trading runs regardless of IST market hours
AUTO_TRADING_ENABLED=true
```
**`client/.env.example`**
```
VITE_API_BASE_URL=http://localhost:4000/api
```
`config/env.js` loads `dotenv`, validates with zod, exports a frozen `env` object. **Every var has a default** so importing never throws (booleans parsed from strings; `IGNORE_MARKET_HOURS`/`AUTO_TRADING_ENABLED` default true; provider default `yahoo`).

---

## 4. Market Data Layer (`server/src/services/marketData/`)

Provider abstraction with automatic fallback + in-memory TTL cache. Each provider is a class exposing `name`, `async getQuote(symbol)` → `StockQuote`, `async getHistory(symbol, days)` → `Candle[]`, where `symbol` is the **canonical** symbol (e.g. `RELIANCE`); the provider maps it to its own ticker via `STOCK_UNIVERSE`.

- `MarketDataProvider.js` — JSDoc describing the provider shape (a base class or interface doc); export a `findUniverse(symbol)` helper that returns the `STOCK_UNIVERSE` entry or throws `SYMBOL_NOT_FOUND`.
- `YahooFinanceProvider.js` — global `fetch` against `https://query1.finance.yahoo.com/v8/finance/chart/{yahoo}?interval=1d&range={range}` with header `User-Agent: Mozilla/5.0`. `getQuote`: `range=5d`, derive price/open/high/low/previousClose/volume from `result.meta` + last candle (`meta.regularMarketPrice`, `meta.chartPreviousClose`). `getHistory(days)`: `range = days<=31 ? '1mo' : days<=93 ? '3mo' : days<=186 ? '6mo' : '1y'`; parse `timestamp[]` + `indicators.quote[0]`; skip null candles.
- `GrowwProvider.js` — **the real Groww Trade API** (`GROWW_BASE_URL`; every request carries headers `Authorization: Bearer ${env.GROWW_ACCESS_TOKEN}`, `X-API-VERSION: ${GROWW_API_VERSION}`, `Accept: application/json`). Throw a clear error on first use if `GROWW_ACCESS_TOKEN` is empty (caller falls back to mock).
  - `getQuote(symbol)`: `GET /live-data/quote?exchange={gexch}&segment={gseg}&trading_symbol={gtsym}` → `{ status, payload }` with `last_price`, `day_change`, `day_change_perc`, `volume`, and an `ohlc` object (`open`,`high`,`low`,`close`). Map to `StockQuote` (price=`last_price`; change=`day_change`; changePercent=`day_change_perc`; previousClose = `last_price - day_change`). Handle missing fields defensively.
  - `getHistory(symbol, days)`: `GET /historical/candle/range?exchange={gexch}&segment={gseg}&trading_symbol={gtsym}&interval_in_minutes=1440&start_time={yyyy-MM-dd HH:mm:ss}&end_time={yyyy-MM-dd HH:mm:ss}` (start = now-days, end = now; URL-encode the space). `payload.candles` is an array of `[epochSeconds, open, high, low, close, volume]` → map to `Candle[]` (`date` = `YYYY-MM-DD` from epoch). Add a comment noting Groww marks this endpoint deprecated and the service falls back to mock on failure.
- `AlphaVantageProvider.js` — `GLOBAL_QUOTE` for quote, `TIME_SERIES_DAILY` for history, using `alpha` ticker + `ALPHA_VANTAGE_API_KEY`. Throw clearly if key missing or rate-limited (`Note`/`Information` in response). NIFTY50 unsupported → throw.
- `MockProvider.js` — **deterministic seeded** random-walk per symbol (seed from symbol char codes; a small seeded PRNG, NOT `Math.random`, so history is stable across calls). Base price per symbol from a table; generate plausible OHLCV and N days of candles with realistic drift. Live quote MAY add a tiny intraday wiggle (`Math.random` allowed there only).
- `index.js` — exports a singleton `marketData` (a `MarketDataService` instance) that: picks the primary provider from `env.MARKET_DATA_PROVIDER` (`yahoo`|`groww`|`alphavantage`|`mock`); on ANY primary error logs a warning and **falls back to MockProvider** (app always works offline / without a Groww subscription); caches quotes (`PRICE_CACHE_TTL_MS`) and history (`HISTORY_CACHE_TTL_MS`) in `Map`s. Methods: `getQuote(symbol)`, `getHistory(symbol, days)`, `getAllQuotes()` (map `STOCK_UNIVERSE`, `Promise.allSettled`, per-symbol fallback), and getter `providerName`. Best-effort (non-blocking) upsert of each fetched quote into the `StockPrice` collection.

---

## 5. Indicators (`server/src/services/indicators.js`)

Pure functions over `number[]`. Export `sma(values, period)`, `ema(values, period)`, `rsi(closes, period=14)`, `macd(closes)` → `{ macd, signal, histogram }`, `momentum(closes, window=10)`, `volumeRatio(volumes, window=20)`. Standard formulas (RSI = Wilder smoothing; MACD = ema12−ema26, signal = ema9 of that, histogram = last macd − last signal; momentum = `(last - closes[len-1-window]) / closes[len-1-window] * 100`; volumeRatio = `lastVolume / avg(last window volumes)`). Guard short arrays with neutral defaults (rsi→50, others→0/1).

---

## 6. AI Signal Engine (`server/src/services/aiSignalService.js`)

`getSignal(symbol)` → `AISignal`: fetch `marketData.getHistory(symbol, 90)`, compute indicators, score:
```
rsiScore   = rsi<30 ? +25 : rsi<40 ? +12 : rsi>70 ? -25 : rsi>60 ? -12 : 0
macdScore  = histogram>0 ? +20 : histogram<0 ? -20 : 0
momScore   = clamp(momentum*3, -20, 20)
trendScore = sma20>sma50 ? +15 : sma20<sma50 ? -15 : 0
net        = rsiScore+macdScore+momScore+trendScore
signal     = net>=SIGNAL.buyThreshold ? 'BUY' : net<=SIGNAL.sellThreshold ? 'SELL' : 'HOLD'
volumeBoost= volumeRatio>1.5 ? 10 : volumeRatio>1.2 ? 5 : 0
confidence = clamp(round(25 + abs(net)*0.9 + volumeBoost), 0, 100)
```
`reason`: concise English citing dominant factors (e.g. `"RSI 28 oversold, MACD bullish, uptrend (SMA20>SMA50), volume spike 1.7x"`). `indicators` rounded. Also export `getTopSignals(limit=3)` → signals for all universe symbols sorted non-HOLD first then confidence desc. Export the pure scoring helper (e.g. `scoreFromIndicators(indicators)` returning `{signal,confidence,reason,net}`) so the backtest reuses identical logic.

---

## 7. Trade / Portfolio Services

**`tradeService.js`** — `executeTrade({ userId, symbol, action, investmentAmount, tradeType, triggerReason })` → `Trade`:
- Fetch live quote; compute slippage fill price.
- **BUY:** `quantity = floor(investmentAmount / fillPrice)` (≥1 else throw error w/ `.code='INSUFFICIENT_AMOUNT'`). `cost = quantity*fillPrice`. Require `user.cashBalance >= cost` else `.code='INSUFFICIENT_FUNDS'`. Decrement cash. Upsert `Position` (recompute avgBuyPrice/quantity/investedAmount if adding; `highestPriceSeen = max(prev, fillPrice)`). Create OPEN `Trade`.
- **SELL:** close the ENTIRE open position for symbol (throw `.code='NO_POSITION'` if none). `proceeds = quantity*fillPrice`; realized `pnl = (fillPrice-avgBuyPrice)*quantity`, `pnlPercent = (fillPrice/avgBuyPrice-1)*100`. Credit cash + `user.realizedPnl`. Remove the Position. Mark the latest OPEN buy `Trade` for that symbol CLOSED (with pnl). Create + return the SELL `Trade`.
- Helpers `mapTradeDoc(doc)` → `Trade`, `mapPositionDoc(doc, quote)` → `Position` (computes currentPrice/value/unrealized from a live quote).

**`portfolioService.js`** — `getPortfolio(userId)` → `PortfolioResponse` (load user + open positions, batch quotes, map, compute `PortfolioSummary`; dayPnl uses `(price-previousClose)*qty`). `getEquityCurve(userId, days=30)` → `EquityPoint[]`: start from `initialCapital`, fold CLOSED trades' realized pnl by `closedAt` date over the last `days`, append current `totalValue` as the final point (comment the approximation).

**Money invariants:** never let cash go negative; round to 2 decimals at writes.

---

## 8. Auto-Trading Engine (`server/src/services/autoTradingService.js` + `jobs/autoTradingJob.js`)

`runAutoTradingCycle(userId)` — called by node-cron (`AUTO_TRADING_CRON`). Skip if `!env.AUTO_TRADING_ENABLED` or (market closed AND `!env.IGNORE_MARKET_HOURS`). try/catch; one-line summary log per cycle.

**AutoInvest** (if `settings.autoInvest.enabled`):
```
1. signals = getTopSignals(all universe)
2. for each BUY signal with confidence >= settings.autoInvest.minConfidenceScore (confidence desc):
3.    skip if an OPEN position already exists for symbol
4.    amount = randomInt(settings.minInvestment, settings.maxInvestment) inclusive
5.    STRICT: clamp amount into [minInvestment, maxInvestment] (assert/log if it ever wasn't)
6.    skip (log) if user.cashBalance < amount
7.    executeTrade({action:'BUY', tradeType:'automatic', triggerReason:`AI BUY signal ${confidence}% confidence`})
8.    set settings.autoInvest.lastExecutedAt = now
   Stop opening new buys when cash buffer is low (avoid dumping all cash in one cycle).
```

**AutoExit** (if `settings.autoExit.enabled`) — for EACH open position, fetch live quote, update `highestPriceSeen = max(highestPriceSeen, currentPrice)`, then (first hit closes via `executeTrade` SELL):
```
unrealizedPct = (currentPrice/avgBuyPrice - 1) * 100
1. stop loss:   unrealizedPct <= -stopLossPercent                                  → "Stop loss hit at {pct}%"
2. take profit: unrealizedPct >= takeProfitPercent                                 → "Take profit hit at {pct}%"
3. trailing:    trailingStopPercent>0 AND currentPrice <= highestPriceSeen*(1-trailingStopPercent/100) → "Trailing stop from peak {peak}"
4. AI exit:     useAiExitSignal AND signal==='SELL' AND confidence>=70             → "AI SELL signal {confidence}%"
```
Persist `highestPriceSeen` even when not exiting.

`isMarketOpen()` in `utils/marketHours.js`: Mon–Fri 09:15–15:30 IST via UTC+5:30 offset, no deps.

`jobs/autoTradingJob.js` exports `startAutoTradingJob()` registering the cron for `DEFAULT_USER_ID`.

---

## 9. Backtest Engine (`server/src/services/backtestService.js`)

`runBacktest(params)` → `BacktestResult`. Fetch history covering the range (filter candles in `[startDate,endDate]`). Walk oldest→newest; from day `i` (≥50 prior candles) compute indicators on `closes[0..i]` and derive a signal via the **same scoring as §6** (`scoreFromIndicators`). Long-only, one position at a time:
- Flat + BUY + confidence≥minConfidenceScore + cash≥perTradeAmount → buy `floor(perTradeAmount/close)` shares (record trade).
- Holding → check exit rules (§8 stop/take/trailing + AI SELL) vs `close`; on hit sell, realize pnl, record trade. Track `highestPriceSeen` while holding.
Daily equity point = `cash + sharesHeld*close`. Metrics: `totalReturnPercent`, `finalCapital`, `maxDrawdownPercent` (max peak-to-trough), `winRate` (% closed trades pnl>0), `totalTrades` (closed), `sharpeRatio = mean(dailyReturns)/std(dailyReturns)*sqrt(252)` (std==0 → 0). `id = randomUUID()` (`node:crypto`). Persist to the `BacktestResult` collection so `GET /api/backtest/results/:id` works.

---

## 10. Mongoose Models (`server/src/models/`)

All `timestamps: true`; `userId` is `Schema.Types.ObjectId`. Each file default-exports the Mongoose model. Import constants from `../config/constants.js`.

- **`User.js`** — `{ name, email (unique), cashBalance, initialCapital, realizedPnl (default 0) }`.
- **`UserSettings.js`** — `{ userId, minInvestment, maxInvestment, autoInvest:{enabled,minConfidenceScore,lastExecutedAt}, autoExit:{enabled,stopLossPercent,takeProfitPercent,trailingStopPercent,useAiExitSignal} }`.
- **`Trade.js`** — mirrors the `Trade` DTO minus `id`; `action`/`tradeType`/`status` string enums; indexes `{userId,status}`, `{userId,createdAt}`.
- **`Position.js`** — `{ userId, symbol, quantity, avgBuyPrice, investedAmount, highestPriceSeen, openedAt }`; unique index `{userId,symbol}`.
- **`StockPrice.js`** — latest snapshot per symbol: `{ symbol (unique), price, change, changePercent, open, high, low, previousClose, volume, timestamp }`.
- **`BacktestResult.js`** — `{ resultId (unique), ...BacktestResult fields }` (use `Schema.Types.Mixed` for nested arrays as needed).
- **`seed.js`** — `ensureSeedData()`: upsert DEFAULT_USER at fixed `_id = DEFAULT_USER_ID` (`cashBalance = initialCapital`, `realizedPnl = 0`); upsert default `UserSettings`. Called once after DB connect.

---

## 11. REST API (under `/api`, all wrapped `{success,data}`)

| Method | Path | Req body / query | `data` |
|---|---|---|---|
| GET | `/api/stocks` | — | `StockQuote[]` |
| GET | `/api/stocks/:symbol/signal` | — | `AISignal` |
| GET | `/api/stocks/:symbol/history` | `?days=30` | `Candle[]` |
| GET | `/api/portfolio` | — | `PortfolioResponse` |
| POST | `/api/trades/manual` | `{ symbol, action, investmentAmount }` | `Trade` |
| GET | `/api/trades` | `?type=manual\|automatic\|all&status=OPEN\|CLOSED\|all&limit=50` | `Trade[]` |
| GET | `/api/settings` | — | `UserSettings` |
| PUT | `/api/settings` | partial `UserSettings` (validated) | `UserSettings` |
| POST | `/api/backtest` | `BacktestParams` | `BacktestResult` |
| GET | `/api/backtest/results/:id` | — | `BacktestResult` |
| GET | `/api/dashboard` | — | `DashboardData` |
| GET | `/api/health` | — | `{ status:'ok', provider, marketOpen }` |

- No auth. `middleware/defaultUser.js` sets `req.userId = DEFAULT_USER_ID`.
- zod validation in `middleware/validate.js`; settings `PUT` enforces §2 `VALIDATION` ranges and `maxInvestment > minInvestment`, `minInvestment >= 500` → 400 `VALIDATION_ERROR`.
- Symbol params validated against `STOCK_UNIVERSE` → 404 `SYMBOL_NOT_FOUND`.
- Error codes: `VALIDATION_ERROR`, `SYMBOL_NOT_FOUND`, `INSUFFICIENT_FUNDS`, `INSUFFICIENT_AMOUNT`, `NO_POSITION`, `NOT_FOUND`, `INTERNAL`.

`server.js`: cors (origin `env.CLIENT_ORIGIN`), `express.json()`, `defaultUser`, mount the `/api` router (default import from `./routes/index.js`), health, error handler LAST. On boot: connect DB → `ensureSeedData()` → `startAutoTradingJob()` → `app.listen(PORT)`.

---

## 12. Client — App Shell, Lib, Routing

- **Router:** `react-router-dom` v6. Routes inside `<Layout>`: `/` Dashboard, `/portfolio` Portfolio, `/trade` Trade, `/settings` Settings, `/backtest` Backtest.
- **`lib/api.js`:** axios instance baseURL `import.meta.env.VITE_API_BASE_URL`. Response interceptor unwraps `{success:true,data}` → returns `data`; on `{success:false}` or HTTP error throws `Error(message)` with `.code`. Export `apiGet`, `apiPost`, `apiPut`.
- **`lib/format.js`:** `formatINR(n)`, `formatPercent(n)` (signed, 2dp, `%`), `formatNumber(n)`, `formatDateTime(iso)`, `pnlColorClass(n)` → `'text-accent'` (we add `accent` to Tailwind) / `'text-danger'` / `'text-gray-400'`.
- **Polling:** `hooks/usePolling.js` — `usePolling(fn, intervalMs, deps=[])`. Dashboard & prices poll every 10s.
- **Theming (`index.css` + tailwind):** bg `#0B0E11`, surface `#151A21`, border `#222A33`, text `#E6E8EB` / muted `#8B97A7`, accent `#00C853`, danger `#FF5252`, info `#3B82F6`. `tailwind.config.js` extends `colors: { accent, danger, info, bg, surface, border, muted }`. Clean sans font. Tailwind/PostCSS configs are ESM (`export default {...}`).

---

## 13. Client — Stores (Zustand, `client/src/store/`, all `.js`)

Each is `create((set, get) => ({...}))`.
- **`useStocksStore.js`** — `{ stocks:[], loading:false, error:null, fetchStocks() }`.
- **`usePortfolioStore.js`** — `{ summary:null, positions:[], loading:false, error:null, fetchPortfolio() }`.
- **`useSettingsStore.js`** — `{ settings:null, loading:false, saving:false, error:null, fetchSettings(), updateSettings(patch) }`.
- **`useSignalsStore.js`** — `{ signals:{}, top:[], loading:false, fetchSignal(symbol), fetchTop() }`.

---

## 14. Client — Services (`client/src/services/`, all `.js`)

Thin wrappers over `lib/api` (already unwrapped to `data`). Exact exports:
- `stocks.service.js`: `getStocks()`, `getSignal(symbol)`, `getHistory(symbol, days=30)`.
- `portfolio.service.js`: `getPortfolio()`.
- `trades.service.js`: `getTrades(filters)`, `executeManualTrade({ symbol, action, investmentAmount })`.
- `settings.service.js`: `getSettings()`, `updateSettings(patch)`.
- `backtest.service.js`: `runBacktest(params)`, `getBacktestResult(id)`.
- `dashboard.service.js`: `getDashboard()`.

---

## 15. Client — Component Inventory (exact names + props)

Producer/consumer contract. Default-export each component. Props are a plain object destructured in the signature (document with JSDoc). Component files are `.jsx`.

**`components/common/`**
- `Card({ title, subtitle, action, className, children })`
- `Badge({ variant /* 'success'|'danger'|'neutral'|'info' */, children, className })`
- `SignalBadge({ signal /* SignalType */, confidence })`
- `AutoBadge({ type /* 'manual'|'automatic' */ })` — manual→green, automatic→blue.
- `ToggleSwitch({ label, enabled, onChange, disabled })` — Groww-style.
- `Spinner({ size /* 'sm'|'md'|'lg' */ })`
- `Modal({ open, title, onClose, children })`
- `INRInput({ value, onChange, min, max, label, error, placeholder })` — `₹` prefix; inline validation msg when out of `[min,max]`.
- `ConfidenceMeter({ score, size })` — 0..100 arc/bar.
- `RangeSlider({ label, value, min, max, step, onChange, format })`
- `StatTile({ label, value, delta, deltaPositive, icon })`

**`components/layout/`**
- `Navbar` — brand "GrowwAI", live portfolio total from `usePortfolioStore`, market-status dot.
- `Sidebar` — nav links w/ lucide icons (LayoutDashboard, Wallet, TrendingUp, Settings, FlaskConical).
- `Layout` — Sidebar + Navbar + `<main>` with `<Outlet/>`.

**`components/dashboard/`**
- `PortfolioSummaryBar({ summary })` — StatTiles: total value, day P&L, total P&L, cash.
- `EquityCurve({ data })` — Recharts `AreaChart`, accent gradient.
- `SignalPanel({ signals })` — SignalBadge + ConfidenceMeter rows.
- `RecentTradesTable({ trades })` — AutoBadge, P&L colored.
- `AutoStatusCards({ autoInvest, autoExit })`.

**`components/trading/`**
- `StockSelector({ stocks, value, onChange })`
- `SignalCard({ signal, loading })`
- `TradePanel` — full manual-trade form (StockSelector, live price, BUY/SELL toggle, INRInput w/ MIN/MAX from settings, shares preview, SignalCard, confirm → `executeManualTrade` → refresh portfolio → success/error).
- `PositionsTable({ positions, onClose, closing })` — Portfolio columns; trailing-stop note.

**`components/settings/`**
- `InvestmentLimits({ settings, onChange })` — min/max via RangeSlider + INRInput.
- `AutoInvestSettings({ settings, onChange })` — ToggleSwitch + confidence RangeSlider.
- `AutoExitSettings({ settings, onChange })` — ToggleSwitch + stop/take/trailing RangeSliders + AI-exit ToggleSwitch.

---

## 16. Client — Pages (`client/src/pages/`, all `.jsx`)

- **`Dashboard.jsx`** (`/`) — `dashboard.service.getDashboard()` on mount + poll 10s; renders PortfolioSummaryBar, EquityCurve, SignalPanel(top3), RecentTradesTable(last10), AutoStatusCards; Spinner/loading + inline error.
- **`Portfolio.jsx`** (`/portfolio`) — `usePortfolioStore`; PositionsTable cols: Symbol, Qty, Avg Price, Current Price, Invested, Current Value, P&L (colored ₹), Unrealized %, trailing-stop status, Close (manual SELL); poll 10s.
- **`Trade.jsx`** (`/trade`) — renders TradePanel; loads stocks + settings.
- **`Settings.jsx`** (`/settings`) — `useSettingsStore`; local draft from settings; the three sections; Save → `updateSettings(draft)`; disable while saving; success/error inline.
- **`Backtest.jsx`** (`/backtest`) — form (StockSelector, start/end dates, initialCapital, perTradeAmount, minConfidence, stop/take/trailing RangeSliders) → `runBacktest` → result cards (return %, max drawdown, win rate, Sharpe, #trades) + EquityCurve of result + trade-log table.

---

## 17. File Ownership Map (do NOT write files outside your set)

**Server**
- `srv-config`: `server/package.json`, `server/.env.example`, `server/src/server.js`, `server/src/config/{env.js,db.js,constants.js}`, `server/src/types.js`, `server/src/utils/{marketHours.js,format.js}`, `server/src/middleware/{asyncHandler.js,errorHandler.js,validate.js,defaultUser.js}`
- `srv-models`: `server/src/models/{User.js,UserSettings.js,Trade.js,Position.js,StockPrice.js,BacktestResult.js,seed.js}`
- `srv-marketdata`: `server/src/services/marketData/{MarketDataProvider.js,YahooFinanceProvider.js,GrowwProvider.js,AlphaVantageProvider.js,MockProvider.js,index.js}`, `server/src/services/indicators.js`
- `srv-services`: `server/src/services/{aiSignalService.js,tradeService.js,portfolioService.js}`
- `srv-auto`: `server/src/services/{autoTradingService.js,backtestService.js}`, `server/src/jobs/autoTradingJob.js`
- `srv-routes`: `server/src/routes/{index.js,stocks.routes.js,portfolio.routes.js,trades.routes.js,settings.routes.js,backtest.routes.js,dashboard.routes.js}`

**Client**
- `cli-shell`: `client/package.json`, `client/vite.config.js`, `client/tailwind.config.js`, `client/postcss.config.js`, `client/index.html`, `client/.env.example`, `client/src/{main.jsx,App.jsx,index.css}`, `client/src/types.js`, `client/src/lib/{api.js,format.js}`
- `cli-state`: `client/src/store/{useStocksStore.js,usePortfolioStore.js,useSettingsStore.js,useSignalsStore.js}`, `client/src/services/{stocks.service.js,portfolio.service.js,trades.service.js,settings.service.js,backtest.service.js,dashboard.service.js}`, `client/src/hooks/{usePolling.js,usePortfolio.js,useSignals.js,useAutoTrading.js}`
- `cli-common`: `client/src/components/common/{Card.jsx,Badge.jsx,SignalBadge.jsx,AutoBadge.jsx,ToggleSwitch.jsx,Spinner.jsx,Modal.jsx,INRInput.jsx,ConfidenceMeter.jsx,RangeSlider.jsx,StatTile.jsx}`
- `cli-layout-dash`: `client/src/components/layout/{Navbar.jsx,Sidebar.jsx,Layout.jsx}`, `client/src/components/dashboard/{PortfolioSummaryBar.jsx,EquityCurve.jsx,SignalPanel.jsx,RecentTradesTable.jsx,AutoStatusCards.jsx}`, `client/src/pages/Dashboard.jsx`
- `cli-portfolio-trade`: `client/src/components/trading/{StockSelector.jsx,SignalCard.jsx,TradePanel.jsx,PositionsTable.jsx}`, `client/src/pages/{Portfolio.jsx,Trade.jsx}`
- `cli-settings-backtest`: `client/src/components/settings/{InvestmentLimits.jsx,AutoInvestSettings.jsx,AutoExitSettings.jsx}`, `client/src/pages/{Settings.jsx,Backtest.jsx}`

**Root**
- `root-docs`: `README.md`, `.gitignore`, root `package.json` (scripts: `install:all`, `dev` via `concurrently`). Do NOT create `server/.env`/`client/.env` (only `.example`, owned by srv-config/cli-shell).

---

## 18. Dependencies (pin reasonable recent versions; NO typescript / @types / tsx)

- **server** `package.json`: `"type":"module"`, engines node>=18. deps: express, cors, mongoose, dotenv, zod, node-cron. devDeps: nodemon. scripts: `"dev":"nodemon src/server.js"`, `"start":"node src/server.js"`. (Node 18+ global `fetch` — no node-fetch.)
- **client** `package.json`: `"type":"module"`. deps: react, react-dom, react-router-dom, zustand, axios, recharts, lucide-react. devDeps: vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer. scripts: `"dev":"vite"`, `"build":"vite build"`, `"preview":"vite preview"`.
- **root** `package.json`: `"type":"module"`. devDeps: concurrently. scripts: `"install:all":"npm --prefix server install && npm --prefix client install"`, `"dev":"concurrently -n server,client \"npm --prefix server run dev\" \"npm --prefix client run dev\""`.

## 18b. README content (owned by `root-docs`)

Include: overview & architecture; provider model (Yahoo default / **Groww real API** / Alpha Vantage / Mock fallback); prerequisites (Node 18+, MongoDB local or Atlas); setup (`npm run install:all`, copy each `.env.example`→`.env`, `npm run dev`); env reference; the §11 REST table; the §8 auto-invest/auto-exit walkthrough; and a **v2 Live Trading Roadmap** for the Groww Trade API:
- Base `https://api.groww.in/v1`, headers `Authorization: Bearer <ACCESS_TOKEN>` + `X-API-VERSION: 1.0`; ₹499/mo subscription.
- Auth (v2): OAuth2 API key + secret → daily access token (today a static `GROWW_ACCESS_TOKEN` powers market data; live trading adds refresh via `GROWW_API_KEY`/`GROWW_API_SECRET`).
- Market data (wired): `/live-data/ltp`, `/live-data/quote`, `/live-data/ohlc`, `/historical/candle/range`.
- Live orders (v2): replace paper `tradeService.executeTrade` with Groww place/modify/cancel + OCO/GTT smart orders; real holdings/positions; map auto-exit stop/take to native GTT/OCO. Keep the provider abstraction; add a parallel `BrokerProvider` (paper vs Groww).
- Refs: docs `https://groww.in/trade-api/docs`, Node SDK `github.com/NithinSGowda/growwapi`.

---

## 19. Acceptance / Self-check (every agent)

Before returning, re-read your file set (§17) and confirm: (a) you wrote exactly those files, all plain JavaScript (no `.ts`/`.tsx`, no type annotations, no `tsconfig`); (b) ESM `import`/`export` only; (c) **server relative imports end in `.js`**; (d) names/props/signatures/error-codes match this contract; (e) no placeholders/stubs; (f) each file is syntactically valid (would pass `node --check` for server files / Vite parse for client files). Return `{ files: [...], notes? }`.

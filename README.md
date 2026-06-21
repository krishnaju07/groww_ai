# GrowwAI

An AI-powered, Groww-style **paper-trading** assistant for Indian equities (NSE). GrowwAI
fetches live market data, generates AI trading signals from technical indicators, and can
**auto-invest** and **auto-exit** positions on your behalf — all against a simulated
₹10,00,000 cash balance. No real money, no real orders: it is paper trading only.

---

## Overview & Architecture

GrowwAI is a JavaScript (ESM) monorepo with two packages:

| Package    | Stack |
|------------|-------|
| `client/`  | Vite + React 18 + **JavaScript/JSX** + Tailwind CSS + Zustand + Recharts + lucide-react |
| `server/`  | Node 18+ + Express + **JavaScript/ESM** + Mongoose + node-cron + zod |

There is **no TypeScript anywhere** in this project — no `.ts`/`.tsx` files, no type
annotations, no `tsconfig`, no `@types`. Shared domain shapes are documented as JSDoc
`@typedef` blocks (in `server/src/types.js` and `client/src/types.js`) for editor
intellisense only; nothing is type-checked.

```
groww_ai/
├── package.json          # root: install:all + dev scripts (concurrently)
├── README.md
├── .gitignore
├── server/               # Express REST API, market-data providers, AI engine, cron jobs
│   └── src/
│       ├── server.js
│       ├── config/       # env (zod-validated), db, constants
│       ├── models/       # Mongoose models + seed
│       ├── services/     # marketData/, indicators, aiSignal, trade, portfolio, autoTrading, backtest
│       ├── jobs/         # node-cron auto-trading job
│       ├── routes/       # /api routers
│       ├── middleware/   # asyncHandler, errorHandler, validate, defaultUser
│       └── utils/        # marketHours, format
└── client/               # React SPA (Vite)
    └── src/
        ├── pages/        # Dashboard, Portfolio, Trade, Settings, Backtest
        ├── components/   # common/, layout/, dashboard/, trading/, settings/
        ├── store/        # Zustand stores
        ├── services/     # thin API wrappers
        ├── hooks/        # usePolling, etc.
        └── lib/          # axios client, formatters
```

### How a trade flows

1. The **market-data layer** (`server/src/services/marketData/`) fetches quotes/history from
   the configured provider, with an automatic fallback to a deterministic mock so the app
   always works offline.
2. The **AI signal engine** computes RSI / MACD / momentum / SMA-trend / volume indicators
   and scores each stock into a `BUY` / `SELL` / `HOLD` signal with a `0..100` confidence.
3. The **auto-trading engine** (node-cron, every 30s) reads your settings and opens BUY
   positions on high-confidence signals (auto-invest) and closes positions on stop-loss /
   take-profit / trailing-stop / AI-SELL rules (auto-exit).
4. The **trade service** simulates fills with realistic slippage, updates positions, and
   tracks realized/unrealized P&L — all paper, against your virtual cash balance.

---

## Market-Data Provider Model

The market-data layer is provider-abstracted with an in-memory TTL cache and an automatic
fallback to the mock provider on **any** primary-provider error. Choose the primary provider
with the `MARKET_DATA_PROVIDER` env var:

| Provider       | `MARKET_DATA_PROVIDER` | Notes |
|----------------|------------------------|-------|
| **Yahoo Finance** (default) | `yahoo` | Free, no API key. Uses `query1.finance.yahoo.com` chart endpoints. |
| **Groww Trade API** (real)  | `groww` | The real Groww Trade API (`https://api.groww.in/v1`). Requires a `GROWW_ACCESS_TOKEN` and a paid subscription (₹499/mo). Used here for **market data**; live order placement is the v2 roadmap. |
| **Alpha Vantage**           | `alphavantage` | Requires `ALPHA_VANTAGE_API_KEY`. Rate-limited on the free tier; NIFTY50 unsupported. |
| **Mock**                    | `mock` | Deterministic seeded random-walk per symbol. Always available; the universal fallback. |

Whichever provider you pick, if a request fails (network error, missing key, missing Groww
subscription, rate limit, etc.) the service logs a warning and falls back to the **Mock**
provider so the app keeps running — including fully offline and without any Groww
subscription.

The tradable universe is a fixed set of NSE large-caps plus the NIFTY 50 index (treated as a
tradable instrument): RELIANCE, TCS, HDFCBANK, INFY, SBIN, WIPRO, ICICIBANK, BAJFINANCE,
MARUTI, TATAMOTORS, NIFTY50.

---

## Prerequisites

- **Node.js 18+** (the server relies on Node's built-in global `fetch`).
- **MongoDB** — a local instance (`mongodb://localhost:27017`) or a MongoDB Atlas cluster.

---

## Setup

From the repository root:

```bash
# 1. Install dependencies for both server and client
npm run install:all

# 2. Create env files from the provided examples
cp server/.env.example server/.env
cp client/.env.example client/.env
# (On Windows PowerShell: Copy-Item server/.env.example server/.env ; Copy-Item client/.env.example client/.env)

# 3. Make sure MongoDB is running, then start both apps together
npm run dev
```

`npm run dev` uses `concurrently` to run the server (`http://localhost:4000`) and the Vite
client (`http://localhost:5173`) side by side. On boot the server connects to MongoDB, seeds
the default demo user + settings, and registers the auto-trading cron job.

You can also run each package on its own:

```bash
npm --prefix server run dev    # nodemon src/server.js
npm --prefix client run dev    # vite
```

---

## Environment Reference

### `server/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server HTTP port. |
| `MONGODB_URI` | `mongodb://localhost:27017/groww_ai` | MongoDB connection string. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (the Vite client). |
| `MARKET_DATA_PROVIDER` | `yahoo` | `yahoo` \| `groww` \| `alphavantage` \| `mock`. |
| `ALPHA_VANTAGE_API_KEY` | _(empty)_ | Required only when `MARKET_DATA_PROVIDER=alphavantage`. |
| `GROWW_ACCESS_TOKEN` | _(empty)_ | Required only when `MARKET_DATA_PROVIDER=groww` (Groww Trade API token). |
| `GROWW_API_KEY` | _(empty)_ | Optional: OAuth2 token generation (v2 live trading). |
| `GROWW_API_SECRET` | _(empty)_ | Optional: OAuth2 token generation (v2 live trading). |
| `IGNORE_MARKET_HOURS` | `true` | `true` = auto-trading runs regardless of IST market hours. |
| `AUTO_TRADING_ENABLED` | `true` | Master switch for the auto-trading cron job. |

Every variable has a default, so the server boots even with an empty `.env`.

### `client/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | Base URL the client uses to reach the API. |

---

## REST API

All endpoints are mounted under `/api`. Successful responses are wrapped as
`{ success: true, data }`; errors as `{ success: false, error, code }`. There is no auth —
a default demo user is assumed on every request.

| Method | Path | Req body / query | `data` |
|--------|------|------------------|--------|
| GET  | `/api/stocks` | — | `StockQuote[]` |
| GET  | `/api/stocks/:symbol/signal` | — | `AISignal` |
| GET  | `/api/stocks/:symbol/history` | `?days=30` | `Candle[]` |
| GET  | `/api/portfolio` | — | `PortfolioResponse` |
| POST | `/api/trades/manual` | `{ symbol, action, investmentAmount }` | `Trade` |
| GET  | `/api/trades` | `?type=manual\|automatic\|all&status=OPEN\|CLOSED\|all&limit=50` | `Trade[]` |
| GET  | `/api/settings` | — | `UserSettings` |
| PUT  | `/api/settings` | partial `UserSettings` (validated) | `UserSettings` |
| POST | `/api/backtest` | `BacktestParams` | `BacktestResult` |
| GET  | `/api/backtest/results/:id` | — | `BacktestResult` |
| GET  | `/api/dashboard` | — | `DashboardData` |
| GET  | `/api/health` | — | `{ status:'ok', provider, marketOpen }` |

**Error codes:** `VALIDATION_ERROR`, `SYMBOL_NOT_FOUND`, `INSUFFICIENT_FUNDS`,
`INSUFFICIENT_AMOUNT`, `NO_POSITION`, `NOT_FOUND`, `INTERNAL`.

---

## Auto-Trading Walkthrough

A node-cron job runs `runAutoTradingCycle` every 30 seconds. Each cycle is skipped if
auto-trading is disabled, or if the market is closed and `IGNORE_MARKET_HOURS=false`.
(IST market hours: Mon–Fri, 09:15–15:30.) Behaviour is driven by your **Settings**.

### Auto-Invest (open positions)

When `autoInvest.enabled` is true, each cycle:

1. Generates AI signals for every stock in the universe (`getTopSignals`).
2. Iterates BUY signals whose `confidence >= autoInvest.minConfidenceScore`, highest
   confidence first.
3. Skips any symbol that already has an open position.
4. Picks a random investment amount between `minInvestment` and `maxInvestment` (inclusive),
   strictly clamped into that range.
5. Skips (and logs) if the available cash balance is below that amount.
6. Executes a paper BUY via `executeTrade` with `tradeType: 'automatic'` and a trigger reason
   like `"AI BUY signal 82% confidence"`, then records `autoInvest.lastExecutedAt`.
7. Stops opening new buys once the cash buffer runs low, so it never dumps all cash in one
   cycle.

### Auto-Exit (close positions)

When `autoExit.enabled` is true, each cycle re-prices every open position, updates the
`highestPriceSeen` peak, and closes the position (paper SELL) on the **first** rule that
fires:

1. **Stop loss** — `unrealizedPct <= -stopLossPercent` → `"Stop loss hit at {pct}%"`.
2. **Take profit** — `unrealizedPct >= takeProfitPercent` → `"Take profit hit at {pct}%"`.
3. **Trailing stop** — when `trailingStopPercent > 0` and the price has fallen
   `trailingStopPercent`% from the peak → `"Trailing stop from peak {peak}"`.
4. **AI exit** — when `useAiExitSignal` is true and the AI emits a `SELL` with
   `confidence >= 70` → `"AI SELL signal {confidence}%"`.

The peak (`highestPriceSeen`) is persisted every cycle, even when no exit triggers.

Tune all of these — investment limits, confidence threshold, stop-loss / take-profit /
trailing-stop percentages, and the AI-exit toggle — on the **Settings** page.

### Backtesting

The **Backtest** page replays the exact same scoring and exit rules over historical candles
for a single symbol and date range, reporting total return %, max drawdown, win rate, Sharpe
ratio, the number of trades, an equity curve, and a full trade log.

---

## v2 Live Trading Roadmap (Groww Trade API)

Today GrowwAI is paper-only. The provider abstraction is designed so that real Groww live
trading can be layered on without rewriting the app.

- **Base & headers.** All Groww Trade API calls use base URL `https://api.groww.in/v1` with
  headers `Authorization: Bearer <ACCESS_TOKEN>` and `X-API-VERSION: 1.0`. The Trade API is a
  paid subscription (₹499/mo).
- **Auth (v2).** OAuth2 with an API key + secret that mints a **daily access token**. Today a
  static `GROWW_ACCESS_TOKEN` powers market data; v2 live trading adds automatic token refresh
  using `GROWW_API_KEY` / `GROWW_API_SECRET`.
- **Market data (already wired).** `/live-data/ltp`, `/live-data/quote`, `/live-data/ohlc`,
  and `/historical/candle/range` are consumed by `GrowwProvider`.
- **Live orders (v2).** Replace the paper `tradeService.executeTrade` with real Groww
  place / modify / cancel order calls plus OCO/GTT smart orders; surface real holdings and
  positions; and map the auto-exit stop-loss / take-profit rules onto native GTT/OCO orders.
  Keep the existing provider abstraction and add a parallel `BrokerProvider` (paper vs Groww)
  so paper and live modes coexist behind the same interface.
- **References.** Trade API docs: <https://groww.in/trade-api/docs>. Community Node SDK:
  <https://github.com/NithinSGowda/growwapi>.

---

## License & Disclaimer

GrowwAI is for educational and demonstration purposes only. It is **paper trading**: it does
not place real orders and does not constitute financial advice. "Groww" is a trademark of its
respective owner; this project is not affiliated with or endorsed by Groww.

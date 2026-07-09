# GrowwAI

A Claude/GPT-driven **intraday auto-trading platform** for Indian equities (NSE cash market),
built on the **Groww Trade API**. GrowwAI reads live prices, multi-timeframe technicals, news,
and its own trade history for each stock, asks an LLM for a scored BUY/SELL/WAIT decision, and
can execute that decision automatically — in a simulated paper account or, once every safety
gate is satisfied, with real money through Groww. Every position is intraday-only: opened with
Groww's MIS product, watched every ~15 seconds by an in-process stop-loss/target monitor, and
force-closed by 15:15 IST if nothing else has closed it first.

Groww is the **only** broker/market-data integration this project uses. There is no multi-broker
abstraction to configure — if you have a Groww Trade API key, that's the only credential you need.

---

## Table of contents

- [Architecture](#architecture)
- [The safety model](#the-safety-model)
- [The AI decision engine](#the-ai-decision-engine)
- [Background jobs](#background-jobs)
- [Groww integration — what's used, and a real account-level gap](#groww-integration--whats-used-and-a-real-account-level-gap)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [REST API](#rest-api)
- [Known limitations](#known-limitations)
- [Disclaimer](#disclaimer)

---

## Architecture

JavaScript (ESM) monorepo, no TypeScript anywhere — shared shapes are documented as JSDoc
`@typedef` blocks in `server/src/types.js` (mirrored, presentation-relevant subset, in
`client/src/types.js`) for editor intellisense only, nothing is type-checked.

| Package   | Stack |
|-----------|-------|
| `server/` | Node 18+ · Express · Mongoose · node-cron · zod · `@anthropic-ai/sdk` · `openai` |
| `client/` | Vite · React 18 (JS/JSX) · Tailwind CSS · Zustand · `lightweight-charts` · `recharts` · `lucide-react` |

Single-user app — one seeded `default-user`, no authentication/login.

### How a decision becomes a trade

```
buildContext(symbol)                     contextBuilder.js
  ├─ LTP + 5m/15m/30m candles              →  RSI, MACD, volume ratio, ATR, 3-timeframe trend,
  │                                            Parabolic SAR, Supertrend, support/resistance
  ├─ Nifty sentiment (SMA20/50 + day change)
  ├─ Sector-relative strength
  ├─ Today's news headlines (free Google News RSS — stock-specific + broad market)
  └─ This symbol's own historical AI-decision track record (win rate, avg P&L)
        │
        ▼
scoreQuant()  ──always runs, no LLM call, cheap──▶  BUY / SELL / WAIT, ATR-sized
        │                                            stop-loss/target, risk-based quantity
        ▼ (if an LLM provider is configured)
callProvider() (Claude or OpenAI, per-user toggle)  ──▶  a second opinion: action, confidence,
        │                                                 a 5-way score breakdown (trend
        │                                                 confluence / momentum / volume /
        │                                                 news sentiment / track record),
        │                                                 and a written justification
        ▼
orderService.placeOrder()   ← the SOLE choke point to any broker
  ├─ riskManager.canTrade()      daily loss cap, per-trade loss cap, max trades/day,
  │                              daily profit lock, kill switch
  ├─ live-trading 5-layer gate   (see below) — only checked when mode === 'live'
  └─ broker.placeOrder()         PaperBroker (simulated fill) or GrowwBroker (real MIS order)
        │
        ▼
positionGuardianJob (every 15s)   watches every open position's stop-loss/target (falls back to
                                  UserSettings.autoExit % if a position has none), ratchets a
                                  trailing stop, and exits the instant a level is hit — plus
                                  reconciles a broker-side GTT/OCO safety order if Groww closed
                                  the position first
        │
        ▼
squareOffJob (15:15 IST daily)   force-closes anything still open — no overnight positions, ever
```

Every automated order — quant-only or LLM-confirmed — is written to `AIDecisionLog` (including
every `WAIT`), so nothing the system decided is ever invisible after the fact.

---

## The safety model

The account's own guiding principle, baked into the AI's system prompt: **small, steady,
compounding daily gains with rare, small, capped losses — not the impossible goal of never
losing.** No real trading system can promise zero losses; this one is built to keep them rare,
small, and expected instead.

- **`orderService.placeOrder()` is the only way to reach a broker.** Routes, the AI engine, and
  every cron job go through it — the risk gate can't be bypassed by a new code path.
- **Risk Manager** (`services/risk/riskManager.js`): per-user configurable daily loss limit,
  per-trade loss limit, max trades/day, max capital per trade (%), and a daily profit lock that
  pauses new entries once today's gain target is hit (closing positions is always still allowed).
- **Kill switch**: one call cancels every order and closes every position across every connected
  broker, then blocks all further trading until a deliberate reset. `brokerHealthJob` can trip it
  automatically after repeated Groww connectivity failures while in Live mode.
- **Live-trading 5-layer gate** (`services/brokers/tradingModeService.js`), ALL required before a
  single real-money order goes out: (1) `enableLiveTrading` master switch, (2) valid Groww
  credentials, (3) the user explicitly selected Live mode, (4) kill switch not tripped, (5) a
  per-order "REAL MONEY" confirmation from the client. Unattended (cron) live orders additionally
  require `enableLiveAutoTrading` — turning that on requires typing a confirmation phrase.
- **Intraday-only, structurally enforced**: every order is Groww's MIS product (never CNC/
  delivery); a new BUY is refused outright once the day's square-off window has passed, regardless
  of source; `positionGuardianJob` polls every ~15s so a stop-loss set at 11 AM doesn't sit
  unenforced for hours; `squareOffJob` force-closes anything still open at 15:15 IST.
- **Smart Orders (GTT/OCO)**: on a live Groww BUY, a broker-side stop-loss/target order is placed
  as a safety net alongside `positionGuardianJob`'s own polling — the position stays protected
  even if this server is down.
- **Idempotent order creation** and an **order-reconciliation job** (every 20s) backfill any live
  fill that raced the broker's own order-status endpoint, so a real fill is never silently
  unrecorded.

---

## The AI decision engine

Every decision runs a cheap deterministic **Quant** scorer (`aiSignalService.js`) — no LLM call,
safe to run every 30 seconds — and, when a provider is configured, cross-checks it against
**Claude or OpenAI** (switchable live from Settings, no restart needed). In the unattended
auto-trading tick, a BUY/SELL only fires if **both models agree** on direction (configurable).

- **Position sizing is risk-based, not a flat rupee amount.** Quantity is the smaller of "fits
  the configured capital per trade" and "the stop-loss distance × quantity never exceeds the
  configured max-loss-per-trade" — so a volatile stock never accidentally risks more than a calm
  one at the same position size.
- **Stop-loss/target are ATR-sized**, not an arbitrary flat percentage — anchored to the stock's
  own real recent volatility, with a flat-percent fallback only when there isn't enough candle
  history yet for ATR.
- **News-aware**: free Google News RSS (no API key, no cost) pulls recent stock-specific and
  broad-market headlines; the LLM reads and judges relevance itself rather than trusting a
  pre-scored sentiment number.
- **Track-record-aware**: each symbol's own historical AI-decision win rate nudges confidence —
  a technically identical setup gets more skepticism on a stock whose recent calls went badly
  (and only once there's a real sample size, so a couple of trades can't swing it).
- **Auditable, not a black box**: every LLM decision includes a `scoreBreakdown` (trend
  confluence / momentum / volume conviction / news sentiment / track record, each 0–100) and a
  multi-sentence `justification`, alongside the short `reason` used as the order's audit-trail
  label. Both are visible in the UI (AI Decisions page, Dashboard feed, and now directly on the
  Orders page for any order an AI decision triggered).
- **Session-phase aware**: the prompt is given `sessionPhase`/`minutesToSquareOff` and is told
  explicitly to demand stronger confluence in the noisy first 30 minutes after open and to lean
  WAIT on fresh entries in the last 45 minutes before square-off.
- **Backtest engine** (`services/backtest/backtestEngine.js`) replays the *same* `scoreQuant`
  scorer over real historical Groww candles — no LLM calls (too slow/costly over months of
  history) and no synthetic data; anything that can't be reconstructed for a past date (news,
  sector/Nifty sentiment, track record) is neutral-stubbed, never faked.

You need at least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` configured for the LLM half to
run at all — without one, the system still trades on the Quant scorer alone (logged as such).

---

## Background jobs

| Job | Interval | Does |
|-----|----------|------|
| `autoTradingJob` | 30s | Screens the whole watchlist, places orders when auto-invest is enabled and a signal clears the confidence bar |
| `aiScanJob` | 5m (configurable) | Read-only background sweep powering "AI Top Picks" / signal badges — never places an order |
| `positionGuardianJob` | 15s | Stop-loss/target/trailing-stop enforcement on every open position; reconciles broker-side GTT/OCO fills |
| `orderReconciliationJob` | 20s | Backfills any live fill that raced the broker's own status endpoint |
| `brokerHealthJob` | 5m | Real Groww connectivity check (`/user/detail`); trips the kill switch after repeated failures while Live |
| `squareOffJob` | 15:15 IST daily (Mon–Fri) | Force-closes every open position — no overnight positions, ever |

---

## Groww integration — what's used, and a real account-level gap

Every Groww Trade API surface this app touches, all under `server/src/services/brokers/GrowwBroker.js`
and `server/src/services/marketData/GrowwProvider.js`:

- **Orders**: create / modify / cancel / detail / list / trades (fill detail) / status-by-reference
- **Smart Orders**: GTT/OCO create / cancel / status / list (the protective stop-loss/target safety net)
- **Portfolio**: holdings, positions (bulk + single-symbol)
- **Margin**: account margin detail, plus a pre-trade margin check before every BUY
- **User**: `/user/detail` — the real "can this account actually trade" check, not just "did a token mint"
- **Historical data**: `/historical/candles` (the current, non-deprecated endpoint)
- **Live data**: quote (LTP) and batch LTP

**Known gap, worth understanding before you rely on it**: Groww gates live/historical market-data
endpoints behind a separate paid add-on (₹499/mo) from order placement/portfolio/margin, which
are free. An account without that add-on gets a `403 Access forbidden` on every quote/candle call
while orders still work fine — this is easy to misdiagnose as a bug. Because of this,
**`MARKET_DATA_PROVIDER=yahoo` (free, no key, no add-on) is the default**, and market data is
fully decoupled from the execution broker — Groww still works as the order-placement broker
regardless of which provider serves prices/candles. Set `MARKET_DATA_PROVIDER=groww` once your
account actually has the add-on.

Separately, Groww requires **registering the server's IP address** at
groww.in/trade-api/api-keys before it will accept live order placement from that IP — a
same-account, unrelated-to-code gate that shows up as `"No registered IPs found for this user"`.

---

## Setup

**Prerequisites**: Node.js 18+, a local or Atlas MongoDB instance.

```bash
# 1. Install dependencies for both server and client
npm run install:all

# 2. Create env files from the provided examples
cp server/.env.example server/.env
cp client/.env.example client/.env
# (Windows PowerShell: Copy-Item server/.env.example server/.env ; Copy-Item client/.env.example client/.env)

# 3. Fill in server/.env — at minimum a Groww credential (GROWW_API_KEY + GROWW_API_SECRET, or
#    GROWW_ACCESS_TOKEN) and at least one AI provider key (ANTHROPIC_API_KEY or OPENAI_API_KEY).
#    Paper mode + Yahoo market data need neither to start exploring the app.

# 4. Make sure MongoDB is running, then start both apps together
npm run dev
```

`npm run dev` runs the server (`http://localhost:4000`) and the Vite client
(`http://localhost:5173`) side by side via `concurrently`. On boot the server connects to
MongoDB, seeds the default user + settings + risk config, and registers every cron job above.

Run each package on its own if you prefer:

```bash
npm --prefix server run dev    # nodemon src/server.js
npm --prefix client run dev    # vite
```

Verify a Groww credential or AI provider independently of the full app:

```bash
npm --prefix server run verify:broker   # pings Groww with the configured credential
npm --prefix server run verify:ai       # pings the configured AI provider + runs a full decide() call
```

---

## Environment variables

### `server/.env`

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `4000` | Server HTTP port |
| `MONGODB_URI` | `mongodb://localhost:27017/groww_ai` | — |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-origin |
| `MARKET_DATA_PROVIDER` | `yahoo` | `yahoo` \| `groww` \| `mock` — live-editable from Settings too |
| `GROWW_ACCESS_TOKEN` | _(empty)_ | Static token, used verbatim if set |
| `GROWW_API_KEY` / `GROWW_API_SECRET` | _(empty)_ | Auto daily-token "approval" flow (preferred) |
| `GROWW_TOTP_SECRET` | _(empty)_ | Alternative "totp" auth flow, used only if `GROWW_API_SECRET` is empty |
| `IGNORE_MARKET_HOURS` | `true` | `true` = jobs run regardless of IST market hours (dev convenience) |
| `AUTO_TRADING_ENABLED` | `true` | Master switch for the 30s auto-trading cron |
| `ENABLE_LIVE_TRADING` | `false` | Master switch for real-money order placement — **default OFF, keep it that way until you mean it** |
| `ENABLE_LIVE_AUTO_TRADING` | `false` | Lets the cron place *unattended* live orders — **default OFF, strongly recommended** |
| `LIVE_MAX_ORDER_VALUE` | `5000` | Hard ₹ cap per live order |
| `AI_LLM_ENABLED` | `true` | Master switch for LLM-driven decisions; without a provider key the app still runs on the Quant scorer alone |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | _(empty)_ / `claude-opus-4-8` | Claude as AI provider |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | _(empty)_ / `gpt-4o` | OpenAI as AI provider (ChatGPT Plus/Pro does **not** include API access — a separate pay-as-you-go key is required) |
| `AI_SCAN_INTERVAL_MINUTES` | `5` | Background AI scan cadence |

Every variable has a schema default (`config/env.js`, zod-validated) — the server boots even with
an empty `.env`, just with live trading and LLM decisions inert until configured.

### `client/.env`

| Variable | Default |
|----------|---------|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` |

---

## Project structure

```
groww_ai/
├── server/
│   └── src/
│       ├── server.js
│       ├── config/         # env (zod), db, constants, systemConfig
│       ├── models/         # Mongoose models + seed
│       ├── services/
│       │   ├── ai/         # contextBuilder, decisionEngine, decisionPrompt, aiSignalService,
│       │   │               # newsService, trackRecordService, autoTradingService, signalCache
│       │   ├── backtest/   # backtestEngine
│       │   ├── brokers/    # PaperBroker, GrowwBroker, growwAuth, registry, tradingModeService
│       │   ├── marketData/ # YahooFinanceProvider, GrowwProvider, MockProvider, index (fallback layer)
│       │   └── risk/       # riskManager, riskConfig, killSwitch, riskMeterService
│       ├── jobs/            # every cron job listed above
│       ├── routes/          # /api routers
│       ├── middleware/      # asyncHandler, errorHandler, validate, defaultUser
│       └── utils/           # marketHours, format, positionLedger, idempotency, retryFillCheck
└── client/
    └── src/
        ├── pages/            # Dashboard, Trade, Portfolio, Orders, AIDecisions, Backtest,
        │                     # LiveTrading, Risk, Brokers, Settings
        ├── components/       # common/, layout/, dashboard/, trading/, brokers/
        ├── store/            # Zustand stores
        ├── services/         # thin API wrappers
        ├── hooks/            # usePolling, etc.
        └── lib/              # axios client, formatters, design tokens
```

---

## REST API

All endpoints are mounted under `/api`. Successful responses are wrapped as
`{ success: true, data }`; errors as `{ success: false, error, code }`. No auth — a single
seeded `default-user` is assumed on every request.

| Router | Mount | Covers |
|--------|-------|--------|
| `health.routes.js` | `/api/health` | Server + market-data-provider status |
| `stocks.routes.js` | `/api/stocks` | Watchlist quotes, candle history |
| `dashboard.routes.js` | `/api/dashboard` | Summary + equity curve |
| `portfolio.routes.js` | `/api/portfolio` | Live positions, equity, P&L |
| `orders.routes.js` | `/api/orders` | Place / list / cancel — the single entry point to `orderService.placeOrder()` |
| `trades.routes.js` | `/api/trades` | Closed-trade history |
| `settings.routes.js` | `/api/settings` | AI provider, confidence threshold, auto-invest/auto-exit config, trading mode |
| `risk.routes.js` | `/api/risk` | Risk config, risk meter, kill switch trip/reset, risk event log |
| `ai.routes.js` | `/api/ai` | Manual "Ask AI" decide, decision log, signal cache, win-rate stats |
| `brokers.routes.js` | `/api/brokers` | Groww connection status/test, active-broker selection |
| `backtest.routes.js` | `/api/backtest` | Run + fetch historical backtests |

---

## Known limitations

- Groww market-data endpoints require a paid add-on this account may not have (see above) — Yahoo
  is the practical default; order execution via Groww is unaffected either way.
- Live order placement additionally requires the account's server IP to be registered with Groww.
- `positionGuardianJob`/`orderReconciliationJob` currently only act on whichever broker
  `effectiveMode()` resolves to right now — a position left open under a broker you've since
  switched away from mid-day isn't tracked by them.
- The Groww API itself has no F&O/options support wired up here — this platform trades NSE cash
  equities only (no calls/puts), matching the curated `STOCK_UNIVERSE`.
- A protective broker-side OCO is only placed on a position's *first* fill for a given symbol —
  a same-day position built from several separate BUYs is only protected at first-entry quantity.

---

## Disclaimer

GrowwAI can place **real orders with real money** once you explicitly configure and enable live
trading — it is not a toy or a simulation-only project. Read the [safety model](#the-safety-model)
before ever setting `ENABLE_LIVE_TRADING=true`. This project is for personal use; it does not
constitute financial advice, and past AI-decision performance (shown throughout the UI) is not a
guarantee of future results. "Groww" is a trademark of its respective owner; this project is not
affiliated with or endorsed by Groww.

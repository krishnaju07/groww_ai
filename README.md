# GrowwAI

A Claude/GPT/Gemini/Grok/Perplexity-driven **intraday auto-trading platform** for Indian markets —
NSE cash equities and Nifty 50 / Bank Nifty / Nifty Financial Services **options (F&O)** — built on
the **Groww Trade API**. GrowwAI reads live prices, multi-timeframe technicals, option greeks/chain
data, news, market regime, and its own trade history, asks an LLM ensemble for a scored
BUY/SELL/WAIT decision, and can execute that decision automatically — in a simulated paper account
or, once every safety gate is satisfied, with real money through Groww. Every position is
intraday-only: opened with Groww's MIS product, watched every ~15 seconds by an in-process
stop-loss/target monitor (with breakeven-ratchet, partial-booking, and time-based exits), and
force-closed by 15:15 IST if nothing else has closed it first.

Groww is the **only** broker/market-data integration this project uses. There is no multi-broker
abstraction to configure — if you have a Groww Trade API key, that's the only credential you need.

---

## Table of contents

- [Architecture](#architecture)
- [The safety model](#the-safety-model)
- [The AI decision engine](#the-ai-decision-engine)
- [Options (F&O) trading](#options-fo-trading)
- [The learning loop](#the-learning-loop)
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
`@typedef` blocks in `server/src/types.js` for editor intellisense only, nothing is type-checked.

| Package   | Stack |
|-----------|-------|
| `server/` | Node 18+ · Express · Mongoose · node-cron · zod · `@anthropic-ai/sdk` · `openai` (also used for Gemini/Grok/Perplexity via their OpenAI-compatible endpoints) · `technicalindicators` |
| `client/` | Vite · React 18 (JS/JSX) · Tailwind CSS · Zustand · `lightweight-charts` (candles + indicator overlays) · `recharts` · `technicalindicators` (client-side chart overlays) · `lucide-react` |

Single-user app — one seeded `default-user`, no authentication/login.

### How a decision becomes a trade — equity

```
buildContext(symbol)                     contextBuilder.js
  ├─ LTP + 5m/15m/30m candles              →  RSI, MACD, volume ratio, ATR, 3-timeframe trend,
  │                                            Parabolic SAR, Supertrend, support/resistance
  ├─ Nifty sentiment + sector-relative strength
  ├─ Today's news headlines (free Google News RSS — stock-specific + broad market)
  └─ This symbol's own historical AI-decision track record (win rate, avg P&L)
        │
        ▼
scoreQuant()  ──always runs, no LLM call, cheap──▶  BUY / SELL / WAIT, ATR-sized
        │                                            stop-loss/target, risk-based quantity
        ▼
Learned-edge gate (BUY only) ── vetoes a fresh entry if the AI's own closed-trade history
        │                        proves this regime/hour is a loser (see "The learning loop")
        ▼ (if an LLM provider is configured)
callProvider() / runConsensus()  ──▶  one provider's second opinion (default), or poll
        │                              EVERY configured provider and require N to agree
        │                              (Settings → AI & Learning → Multi-AI consensus)
        ▼
orderService.placeOrder()   ← the SOLE choke point to any broker
  ├─ riskManager.canTrade()      daily loss cap, daily profit target/lock, per-trade loss cap,
  │                              max trades/day, consecutive-loss stop, kill switch
  ├─ live-trading 5-layer gate   (see below) — only checked when mode === 'live'
  └─ broker.placeOrder()         PaperBroker (simulated fill) or GrowwBroker (real MIS order)
        │
        ▼
positionGuardianJob (every 15s)   stop-loss/target/trailing, move-to-breakeven, partial-book,
                                  time-based exit — falls back to UserSettings.autoExit % if a
                                  position has none; reconciles broker-side GTT/OCO fills
        │
        ▼
squareOffJob (15:15 IST daily)   force-closes anything still open — no overnight positions, ever
        │
        ▼
tradeCritiqueService  → a deterministic post-trade self-critique (GOOD_TRADE/ACCEPTABLE/MISTAKE)
                         written the instant the trade closes; feeds back into the learned-edge gate
```

The options path (below) branches at `scoreQuant` into its own strategy-selection + sizing logic,
then rejoins the same `orderService.placeOrder()` choke point, guardian job, and square-off.

Every automated decision — quant-only or LLM-confirmed, equity or options — is written to
`AIDecisionLog` (including every `WAIT`), so nothing the system decided is ever invisible after
the fact. Every tick's activity (fired, skipped, vetoed, blocked) is also written to
`AutoTradeActivity` and shown live on the Dashboard/Live Trading pages — not just the server
console.

---

## The safety model

The account's own guiding principle, baked into the AI's system prompt: **small, steady,
compounding daily gains with rare, small, capped losses — not the impossible goal of never
losing.** No real trading system can promise zero losses; this one is built to keep them rare,
small, and expected instead.

- **`orderService.placeOrder()` is the only way to reach a broker.** Routes, the AI engine, and
  every cron job go through it — the risk gate can't be bypassed by a new code path.
- **Two switches gate unattended auto-trading, both required**: `UserSettings.autoInvest.enabled`
  (Settings → Trading tab) is the core engine switch; `systemConfig.autoTradingEnabled` (Live
  Trading page) is the other. Both default OFF/OFF or ON/OFF depending on install — check both if
  auto-trading doesn't seem to be firing.
- **Auto-Trading Focus** (Settings → Trading): which market the unattended tick acts on —
  `OPTIONS` (default), `EQUITY`, or `BOTH`. Manual trading and AI Top Picks are unaffected either
  way; this only gates the automated loop.
- **Risk Manager** (`services/risk/riskManager.js`): per-user configurable daily loss limit,
  daily ₹ profit target (stop when you've won — the Golden Rule), daily profit lock (%), a
  consecutive-loss stop (no revenge trading), per-trade loss limit, max trades/day, and max
  capital per trade (%).
- **Learned-edge gate** (`learnedEdgeService.js`): before a fresh entry, checks the AI's own
  closed-trade history for this exact regime/side/hour/strategy combination and vetoes a setup
  with a proven losing expected value over enough samples. Inert on a fresh account — it only
  grows teeth once real history exists, and never conflates directional trades with volatility-
  straddle trades even under the same market regime.
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
  of source; `positionGuardianJob` polls every ~15s; `squareOffJob` force-closes anything still
  open at 15:15 IST.
- **Smart Orders (GTT/OCO)**: on a live Groww BUY, a broker-side stop-loss/target order is placed
  as a safety net alongside `positionGuardianJob`'s own polling — the position stays protected
  even if this server is down.
- **Idempotent order creation** and an **order-reconciliation job** (every 20s) backfill any live
  fill that raced the broker's own order-status endpoint, so a real fill is never silently
  unrecorded.

---

## The AI decision engine

Every decision runs a cheap deterministic **Quant** scorer (`aiSignalService.js`) — no LLM call,
safe to run every 30 seconds. Five LLM providers are supported — **Claude, OpenAI, Gemini, Grok,
Perplexity** — switchable live from Settings with a per-provider model picker (cheaper models cost
less per call). In the unattended auto-trading tick, a BUY/SELL fires only if the quant scorer and
the LLM agree (default), or — with **Multi-AI consensus** enabled — only if a configurable number
of *every* configured provider independently agree on direction.

- **Position sizing is risk-based, not a flat rupee amount.** Quantity is the smaller of "fits the
  configured budget" and "the stop-loss distance × quantity never exceeds the configured
  max-loss-per-trade."
- **Stop-loss/target are ATR-sized**, anchored to the instrument's own real recent volatility,
  with a flat-percent fallback only when there isn't enough candle history yet.
- **Market-regime aware** (`regimeService.js`): classifies the broad NIFTY market into
  STRONG/MILD_BULLISH, STRONG/MILD_BEARISH, RANGE_BOUND, CHOPPY, or HIGH_VOLATILITY (via ADX +
  ATR% + 3-timeframe trend agreement) *before* considering a trade — fresh entries are blocked in
  a non-tradeable regime unless a regime-specific strategy applies (see Options below).
- **Opportunity-scored** (options only, `opportunityScore.js`): a 0–100 composite of directional
  conviction, regime alignment, greeks favorability, liquidity, and OI positioning gates whether a
  setup is even worth spending an LLM call on — the core cost-minimization mechanism.
- **News-aware**: free Google News RSS (no API key, no cost) pulls recent stock-specific and
  broad-market headlines, with a configurable recency window (Settings → Data Sources); the LLM
  reads and judges relevance itself.
- **Track-record- and learned-edge-aware**: each symbol/side's own historical AI-decision win rate
  nudges confidence, and the learned-edge gate can veto a setup outright (see "The learning loop").
- **Auditable, not a black box**: every LLM decision includes a `scoreBreakdown` and a
  multi-sentence `justification`, visible in the UI (AI Decisions page, Dashboard feed, Orders
  page). Setting `AI_DEBUG_LOG=true` (default) also prints the exact system prompt, user content,
  and raw response for every real LLM call to the server console.
- **Session-phase aware**: demands stronger confluence in the noisy first minutes after open and
  leans WAIT on fresh entries close to square-off.
- **Backtest engine** (`services/backtest/backtestEngine.js`) replays the *same* `scoreQuant`
  scorer over real historical Groww candles — no LLM calls, no synthetic data.

You need at least one provider key configured for the LLM half to run at all — without one, the
system still trades on the Quant scorer alone (logged as such).

---

## Options (F&O) trading

Nifty 50, Bank Nifty, and Nifty Financial Services options, alongside equities:

- **Instrument sync** (`instrumentSync.js`, daily cron + boot-if-empty): downloads Groww's public
  instrument CSV (the only source of strike/expiry/lot-size truth — there is no dynamic
  option-chain API) into the `Instrument` collection.
- **Contract resolution**: nearest expiry + ATM strike, resolved fresh each tick from synced
  instrument data — never hardcoded.
- **Greeks** (`optionGreeks.js`): Black-Scholes delta/gamma/theta/vega/rho + an implied-vol solver,
  computed from the premium alone — works even without a live greeks feed. Groww's own greeks
  endpoint is preferred when entitled.
- **Chain intelligence** (`optionChainIntelligence.js` / `optionIntelService.js`): PCR, Max Pain,
  OI-based support/resistance, and liquidity scoring across a window of strikes around ATM —
  degrades to `available: false` with an honest reason when the live F&O data feed isn't
  entitled, never fabricates numbers.
- **Two strategies, selected by market regime** (`optionStrategies.js`):
  - **Directional** (default): buy the CE or PE that matches the underlying's technical
    direction, sized and stopped like the equity path but in premium terms.
  - **Volatility straddle** (opt-in, Settings → AI & Learning): in a HIGH_VOLATILITY regime —
    direction unclear but a big move likely — buy *both* the CE and PE. A materially different
    risk shape (two simultaneous legs), off by default. The learned-edge gate and self-critique
    both bucket straddle history completely separately from directional history, since their P&L
    patterns are nothing alike.
- **Richer option-chain UI**: ITM/OTM shading, per-contract greeks, and a PCR/Max-Pain summary bar
  on the Trade page's chain picker (`OptionsSelector.jsx`).

---

## The learning loop

- **`learnedEdgeService.js`** — computes the expected value (win rate × avg win vs. avg loss) of
  the AI's own past trades bucketed by regime, option side, hour, and strategy. A bucket with a
  proven negative EV over enough samples (`LEARNING_MIN_SAMPLE`) vetoes a matching fresh entry.
- **`tradeCritiqueService.js`** — the instant a trade closes, writes a deterministic verdict
  (`GOOD_TRADE` / `ACCEPTABLE` / `MISTAKE`) with specific lessons (e.g. "stop-loss did its job" vs.
  "loss ran well past a normal stop — tighten it"), shown on the Reports page.
- **Reports page** (`reports.routes.js` / `analyticsService.js`) — daily/weekly/monthly P&L, win
  rate, profit factor, best/worst trading hour, and a full regime/side/confidence/hour breakdown
  of what conditions the AI's trades actually make money under.

---

## Background jobs

| Job | Interval | Does |
|-----|----------|------|
| `autoTradingJob` | 30s | Screens the watchlist(s) per Auto-Trading Focus, places orders when auto-invest is enabled and every gate clears |
| `aiScanJob` | 5m (configurable) | Read-only background sweep powering "AI Top Picks" / signal badges — never places an order |
| `positionGuardianJob` | 15s | Stop-loss/target/trailing/breakeven-move/partial-book/time-exit on every open position; reconciles broker-side GTT/OCO fills |
| `instrumentSyncJob` | daily + boot-if-empty | Downloads Groww's instrument CSV (strikes/expiries/lot sizes) |
| `orderReconciliationJob` | 20s | Backfills any live fill that raced the broker's own status endpoint |
| `brokerHealthJob` | 5m | Real Groww connectivity check (`/user/detail`); trips the kill switch after repeated failures while Live |
| `squareOffJob` | 15:15 IST daily (Mon–Fri) | Force-closes every open position — no overnight positions, ever |

---

## Groww integration — what's used, and a real account-level gap

Every Groww Trade API surface this app touches, under `server/src/services/brokers/GrowwBroker.js`
and `server/src/services/marketData/GrowwProvider.js`:

- **Orders**: create / modify / cancel / detail / list / trades (fill detail) / status-by-reference
- **Smart Orders**: GTT/OCO create / cancel / status / list
- **Portfolio**: holdings, positions (bulk + single-symbol)
- **Margin**: account margin detail, plus a pre-trade margin check before every BUY
- **User**: `/user/detail` — the real "can this account actually trade" check
- **Historical data**: `/historical/candles` (CASH and FNO segments)
- **Live data**: quote / LTP (batch), and a dedicated greeks endpoint (FNO)

**Two real, confirmed account-level gaps, worth understanding before you rely on this:**

1. **Token generation itself requires a daily manual approval** on Groww's Cloud API Keys page for
   the checksum-based ("approval") auth flow — a recurring step, not one-time setup. Without it,
   token generation fails with `"Session approval required before generating token"` before any
   API call is even attempted.
2. **Live market data is a separate entitlement from trading.** On an account without it, every
   `/live-data/quote` and `/live-data/ltp` call returns `403 Access forbidden` — for *both* CASH
   and FNO segments — while `/positions`, `/holdings`, and `/order/list` all return `200 OK` on
   the very same token. This isolates the gap precisely: it's a market-data subscription/scope
   issue, not a general account or F&O-specific problem. Because of this, **`MARKET_DATA_PROVIDER
   =yahoo` (free, no key, no add-on) is the default** for equities, fully decoupled from the
   execution broker — Groww still places real orders regardless of which provider serves prices.
   Options premiums/greeks/chain-intelligence, however, have no non-Groww substitute and stay
   `unavailable` (with an honest reason, never a fabricated ₹0) until this entitlement is active.

Separately, Groww requires **registering the server's IP address** at
groww.in/trade-api/api-keys before it will accept live order placement from that IP.

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
#    GROWW_ACCESS_TOKEN) and at least one AI provider key (see the table below for all five).
#    Paper mode + Yahoo market data need neither to start exploring the app.

# 4. Make sure MongoDB is running, then start both apps together
npm run dev
```

`npm run dev` runs the server (`http://localhost:4000`) and the Vite client
(`http://localhost:5173`) side by side via `concurrently`. On boot the server connects to
MongoDB, seeds the default user + settings + risk config, syncs the options instrument master if
empty, and registers every cron job above.

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
| `GROWW_API_KEY` / `GROWW_API_SECRET` | _(empty)_ | Daily-approval "approval" auth flow (preferred) — see the Groww gaps above |
| `GROWW_TOTP_SECRET` | _(empty)_ | Alternative "totp" auth flow, used only if `GROWW_API_SECRET` is empty |
| `IGNORE_MARKET_HOURS` | `true` | `true` = jobs run regardless of IST market hours (dev convenience — turn off before going live) |
| `AUTO_TRADING_ENABLED` | `true` | One of two auto-trading master switches (see Safety model) |
| `ENABLE_LIVE_TRADING` | `false` | Master switch for real-money order placement — **default OFF, keep it that way until you mean it** |
| `ENABLE_LIVE_AUTO_TRADING` | `false` | Lets the cron place *unattended* live orders — **default OFF, strongly recommended** |
| `LIVE_MAX_ORDER_VALUE` | `5000` | Hard ₹ cap per live order |
| `AI_LLM_ENABLED` | `true` | Master switch for LLM-driven decisions; without a provider key the app still runs on the Quant scorer alone |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | _(empty)_ / `claude-opus-4-8` | Claude |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | _(empty)_ / `gpt-5.4-mini` | OpenAI (a pay-as-you-go API key, not a ChatGPT subscription) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | _(empty)_ / `gemini-2.5-flash` | Gemini, via its OpenAI-compatible endpoint |
| `GROK_API_KEY` / `GROK_MODEL` | _(empty)_ / `grok-4.3` | Grok (xAI), via its OpenAI-compatible endpoint |
| `PERPLEXITY_API_KEY` / `PERPLEXITY_MODEL` | _(empty)_ / `sonar-pro` | Perplexity, via its OpenAI-compatible endpoint |
| `AI_SCAN_INTERVAL_MINUTES` | `5` | Background AI scan cadence |
| `NEWS_MAX_AGE_HOURS` / `NEWS_HEADLINE_COUNT` | `24` / `3` | News recency window + headline count fed into the AI context |
| `AVOID_FIRST_MINUTES` / `STOP_NEW_TRADES_AFTER` | `15` / `14:45` | Fresh-entry time-of-day discipline |
| `SKIP_LUNCH_HOUR` / `AVOID_EXPIRY_DAY` | `false` / `false` | Skip the 12–1pm window / the underlying's weekly expiry day |
| `REGIME_FILTER_ENABLED` | `true` | Block fresh entries unless the NIFTY regime is classified tradeable |
| `OPPORTUNITY_SCORE_THRESHOLD` | `55` | Min 0–100 options opportunity score before spending an LLM call |
| `CONSENSUS_ENABLED` / `CONSENSUS_MIN_AGREE` | `false` / `2` | Multi-AI consensus (poll every provider) |
| `LEARNING_GATE_ENABLED` / `LEARNING_MIN_SAMPLE` | `true` / `5` | Learned-edge veto gate |
| `AI_DEBUG_LOG` | `true` | Log full LLM request/response to the server console |
| `VOLATILITY_STRADDLE_ENABLED` | `false` | Buy both CE+PE in a HIGH_VOLATILITY regime |
| `AUTO_TRADING_FOCUS` | `OPTIONS` | `EQUITY` \| `OPTIONS` \| `BOTH` — which market the auto-trading tick acts on |

Every variable has a schema default (`config/env.js`, zod-validated) — the server boots even with
an empty `.env`. Almost everything above is also live-editable from the Settings page without a
restart (`UserSettings.systemConfig`), which is DB-authoritative once touched.

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
│       ├── models/         # Mongoose models + seed (Order, Position, Trade, AIDecisionLog,
│       │                   # AutoTradeActivity, TradeCritique, Instrument, RiskConfig, ...)
│       ├── services/
│       │   ├── ai/         # contextBuilder, decisionEngine, decisionPrompt, aiSignalService,
│       │   │               # autoTradingService, consensusService, regimeService,
│       │   │               # opportunityScore, optionGreeks, optionChainIntelligence,
│       │   │               # optionIntelService, optionStrategies, learnedEdgeService,
│       │   │               # tradeCritiqueService, newsService, trackRecordService, signalCache
│       │   ├── backtest/   # backtestEngine
│       │   ├── brokers/    # PaperBroker, GrowwBroker, growwAuth, registry, tradingModeService
│       │   ├── instruments/ # instrumentSync, instrumentService (options strike/expiry/lot data)
│       │   ├── marketData/ # YahooFinanceProvider, GrowwProvider, MockProvider, index (fallback layer)
│       │   └── risk/       # riskManager, riskConfig, killSwitch, riskMeterService
│       ├── jobs/            # every cron job listed above
│       ├── routes/          # /api routers (incl. options.routes.js, reports.routes.js)
│       ├── middleware/      # asyncHandler, errorHandler, validate, defaultUser
│       └── utils/           # marketHours, format, positionLedger, idempotency, retryFillCheck
└── client/
    └── src/
        ├── pages/            # Dashboard, Trade, Portfolio, Orders, AIDecisions, Reports,
        │                     # Backtest, LiveTrading, Risk, Brokers, Settings
        ├── components/
        │   ├── dashboard/    # LivePriceChart (candles + Supertrend/PSAR/volume/AI markers),
        │   │                 # TodayGlanceCard, LearningInsightTeaser, EquityCurve, ...
        │   └── trading/      # OptionsSelector (chain + greeks + PCR/Max-Pain), StockSelector,
        │                     # TradePanel, PositionsTable, RegimeBadge, AutoTradeActivityFeed
        ├── store/            # Zustand stores
        ├── services/         # thin API wrappers
        ├── hooks/            # usePolling, etc.
        └── lib/              # axios client, formatters, chartIndicators (client-side Supertrend/PSAR), design tokens
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
| `options.routes.js` | `/api/options` | Underlyings, expiries, option chain (premiums + greeks + chain intel) |
| `watchlist.routes.js` | `/api/watchlist` | Personal focus list (equities + option underlyings) |
| `dashboard.routes.js` | `/api/dashboard` | Summary + equity curve |
| `portfolio.routes.js` | `/api/portfolio` | Live positions, equity, P&L |
| `orders.routes.js` | `/api/orders` | Place / list / cancel — the single entry point to `orderService.placeOrder()` |
| `trades.routes.js` | `/api/trades` | Closed-trade history |
| `reports.routes.js` | `/api/reports` | Daily/weekly/monthly performance report, learning-engine insights, self-critiques |
| `settings.routes.js` | `/api/settings` | AI provider, auto-invest/auto-exit config, auto-trading focus, trading mode |
| `risk.routes.js` | `/api/risk` | Risk config, risk meter, kill switch trip/reset, risk event log |
| `ai.routes.js` | `/api/ai` | Manual "Ask AI" decide (equity + options), decision log, signal cache, regime, win-rate stats, auto-trading activity feed |
| `brokers.routes.js` | `/api/brokers` | Groww connection status/test, active-broker selection |
| `backtest.routes.js` | `/api/backtest` | Run + fetch historical backtests |

---

## Known limitations

- **Groww market-data entitlement gap** (see above) — Yahoo is the practical default for equities;
  order execution via Groww is unaffected. Options premiums/greeks/chain-intelligence have no
  substitute and stay honestly `unavailable` until the account has this add-on.
- Live order placement additionally requires the account's server IP to be registered with Groww.
- `positionGuardianJob`/`orderReconciliationJob` currently only act on whichever broker
  `effectiveMode()` resolves to right now — a position left open under a broker you've since
  switched away from mid-day isn't tracked by them.
- A protective broker-side OCO is only placed on a position's *first* fill for a given symbol —
  a same-day position built from several separate BUYs is only protected at first-entry quantity.
- The volatility-straddle strategy manages its two legs independently (each leg is its own
  Position with its own stop/target) rather than as one combined position — a real straddle is
  usually managed by letting the winning leg run untouched while the losing leg decays. Each leg
  gets a deliberately wide stop/target as an approximation, not a perfect combined-position exit.
- Single-broker (Groww only) and single-user (no auth/login) by design — not built for multi-tenant
  or multi-broker use.

---

## Disclaimer

GrowwAI can place **real orders with real money** once you explicitly configure and enable live
trading — it is not a toy or a simulation-only project. Read the [safety model](#the-safety-model)
before ever setting `ENABLE_LIVE_TRADING=true`. This project is for personal use; it does not
constitute financial advice, and past AI-decision performance (shown throughout the UI) is not a
guarantee of future results. Options carry sharper risk than equities (premium can go to zero;
theta decay accelerates near expiry). "Groww" is a trademark of its respective owner; this project
is not affiliated with or endorsed by Groww.

# GrowwAI — Trade Desk Redesign Spec

> Read in full. Builds on the glass+glow system (`DESIGN.md`, `lib/ui.js`, primitives).
> Goal: turn `/trade` into a proper 3-pane trading desk + fix three usability issues.

## 0. Hard rules
- Reuse `lib/ui.js` recipes + primitives (`AnimatedNumber`, `Sparkline`, `Skeleton`) + existing common components (`Modal`, `SignalCard`, `INRInput`, etc.). Numbers carry `num`. No new dependencies (react, react-router-dom, zustand, recharts, lucide-react only).
- Preserve the trade flow + safety: keep `executeManualTrade`, `fetchPortfolio()` refresh, the live-mode REAL MONEY confirm Modal, toasts (`toast.success/error` from `../../store/useToastStore`), and the inline result banner.
- Do NOT modify off-limits data files (stores/services/lib/api/lib/format/types.js/lib/ui.js/tailwind.config/index.css/the 3 primitives/server/*) — EXCEPT `components/common/INRInput.jsx` which is being fixed here.
- Read cash from `usePortfolioStore` (`summary.cashBalance`) and positions from `usePortfolioStore` (`positions`). Read AI signals from `useSignalsStore`.
- Accessibility: keyboard-reachable controls, focus rings, valid JSX, must pass `vite build`.

## 1. Three required fixes
1. **Clearable amount field (`INRInput`)** — today the field can't be emptied (clearing snaps to `0`). Fix WITHOUT changing its props (`{ value:number, onChange, min, max, label, error, placeholder }`): keep an internal display-string state so the user can clear/retype; sync that string from the numeric `value` prop when it changes externally (so quick-amount chips / qty conversions still update the field); emit the parsed number on change (empty → `0`). Field shows empty (placeholder) when cleared, not "0".
2. **One-click AI place/sell** — a prominent "Follow AI" action in the order ticket that reads the selected stock's signal and executes it: BUY signal → places a BUY (current amount); SELL signal → sells the open position; disabled with a clear label when the signal is HOLD or when SELL has no position. Honors the live-mode confirm + toasts like a normal order.
3. **Always-usable actions** — buttons must never be silently dead. SELL is enabled only when a position exists (else disabled with "No position in {symbol}"); BUY shows the existing "amount buys 0 shares" hint; the AI button shows why it's disabled. Each disabled control has a one-line reason.

## 2. Page layout — `pages/Trade.jsx`
Owns the selected `symbol` (default = first stock) and lifts it to all panes. Fetches on mount: `fetchStocks()`, `fetchSettings()`, `fetchPortfolio()`, `useSignalsStore.fetchTop()` (for watchlist pills) + `fetchSignal(symbol)` for the selected one. Light polling: `usePolling(fetchStocks, 10000)` and `usePolling(fetchPortfolio, 10000)`.

Responsive grid:
- `xl`: 3 columns `grid-cols-[300px_1fr_380px]` → **Watchlist | Center | Order ticket**.
- `lg`: 2 columns (Center + ticket; watchlist full-width on top).
- base (mobile): single column stacked (Watchlist, Center, ticket).

Panes:
- **Left** — `<MarketWatchlist stocks={stocks} signals={signalMap} value={symbol} onSelect={setSymbol} loading={stocksLoading} />` where `signalMap` is a `{ [symbol]: AISignal }` built from `useSignalsStore.top` + `signals`.
- **Center** — a `GLASS_CARD` with: stock header (name + `AnimatedNumber` price + colored ▲/▼ change), `<TradeChart symbol={symbol} />`, and the AI signal via the existing `<SignalCard signal={signals[symbol]} loading={...} />`.
- **Right** — `<TradePanel symbol={symbol} onSymbolChange={setSymbol} />`.

Keep the page header ("Trade" + subtitle) and the error banner.

## 3. New components (`components/trading/`)

### `MarketWatchlist.jsx` — `{ stocks, signals, value, onSelect, loading }`
Searchable live list. A search `<input>` (filters by symbol/name). Each row (`GLASS_PANEL`, button/clickable, focus ring): symbol + name (truncate), a small signal pill from `signals[symbol]` (BUY=accent, SELL=danger, HOLD=neutral; omit if none), live price (`num`) + colored ▲/▼ `changePercent`, optional tiny `Sparkline`. The selected row (`value`) gets an accent ring + tint. `loading && empty` → `Skeleton` rows. Calls `onSelect(symbol)`. Scrollable (`max-h` + `overflow-y-auto no-scrollbar`) on desktop.

### `TradeChart.jsx` — `{ symbol }`
Local `timeframe` state (`'1W'|'1M'|'3M'` → 7/30/90 days). On `symbol`/`timeframe` change, fetch `stocksService.getHistory(symbol, days)` (import `* as stocksService from '../../services/stocks.service'`), map candles → `{ date, close }[]`. Render a Recharts `AreaChart` (accent gradient fill `#00C853`→transparent, glowing line, faint grid, a custom dark **glass tooltip** showing date + `formatINR(close)`, minimal/hidden axes), height ~220. Timeframe chips (active = accent tint). `Skeleton` while loading; styled empty state ("No chart data"). Color the area red when the period's last<first.

### `OrderSummary.jsx` — `{ action, price, estShares, amount, cashBalance, position }`
A `GLASS_PANEL` list of label→value rows (`num`, right-aligned):
- BUY: **Est. cost** `formatINR(estShares*price)`; **Est. slippage** `~0.2%` `formatINR(estShares*price*0.002)`; **Available cash** `formatINR(cashBalance)`; **Cash after** `formatINR(cashBalance - estShares*price)` (red if negative); **Shares after** `estShares`.
- SELL: **Quantity** `position?.quantity ?? 0`; **Est. proceeds** `formatINR((position?.quantity||0)*price)`; **Unrealized P&L** colored `formatINR(position?.unrealizedPnl||0)`; **Cash after** `formatINR(cashBalance + (position?.quantity||0)*price)`.
Guard all when data missing.

### `PositionContext.jsx` — `{ position, price }`
If `position`: a compact `GLASS_PANEL` — "You hold **{quantity} {symbol}** @ {formatINR(avgBuyPrice)}", current value `formatINR(quantity*price)`, and live **P&L** colored (`unrealizedPnl` + `formatPercent(unrealizedPnlPercent)`). If none: a muted "No open position in {symbol}." line.

## 4. Order ticket — `components/trading/TradePanel.jsx` (redesign)
New props `{ symbol, onSymbolChange }` (symbol is now controlled by the page; keep a `<StockSelector stocks value={symbol} onChange={onSymbolChange} />` at the top for quick switching, especially on mobile). Keep reading settings/signals/portfolio/trading-mode. Internally manage `action`, input `mode` ('amount'|'shares'), `amount`, `qty`, `submitting`, `result`, `confirmLiveOpen`.

- Read `cashBalance` from `usePortfolioStore(s=>s.summary?.cashBalance)`, `positions` from `usePortfolioStore(s=>s.positions)`; `position = positions.find(p=>p.symbol===symbol) || null`.
- **BUY/SELL** segmented toggle (existing styling). SELL is selectable always, but the Place/AI buttons gate on having a position.
- **Input mode toggle** "By Amount / By Shares" (only for BUY):
  - *Amount*: `INRInput` + **quick-amount chips**: a few presets within `[min,max]` (e.g. `min`, round midpoints, `max`), a **Max** chip = `Math.min(maxInvestment, cashBalance)`, and **25% / 50%** of `cashBalance` (each clamped to `[min,max]`). Clicking a chip sets `amount`.
  - *Shares*: a small qty number input (min 1) → convert to amount: `amount = Math.ceil(qty * price * 1.004)` (slippage buffer so the server's `floor(amount/fillPrice)` lands on `qty`); show the resulting est. cost. If the needed amount exceeds `maxInvestment`, show a warn hint.
  - `estShares = price>0 ? Math.floor(amount/price) : 0`. Keep the existing "₹X buys 0 shares…" warn hint.
- **`<PositionContext position={position} price={price} />`** below the inputs.
- **`<OrderSummary action price estShares amount cashBalance position />`**.
- **Follow-AI button** (fix #2): let `sig = signals[symbol]`. Render a button labelled `Follow AI · {sig.signal} {symbol} ({sig.confidence}%)`:
  - BUY signal → on click set `action='BUY'` and submit with the current amount.
  - SELL signal → set `action='SELL'` and submit (sells the position).
  - Disabled when `!sig` ("AI signal loading"), `sig.signal==='HOLD'` ("AI suggests HOLD — no action"), or SELL-signal with no position ("No position to sell"). Style it as a secondary accent/gradient action distinct from the manual Place button.
- **Place button**: BUY → enabled when amount valid & `estShares>=1`; SELL → enabled only when `position` exists (else disabled, label "No position in {symbol}"). Label `Place {action} {symbol}` (live mode → "Place LIVE …"), with the REAL MONEY banner + per-order confirm Modal + `Spinner` while submitting, exactly as today.
- Submitting path: factor a `submit(overrideAction?)` so both the Place button and Follow-AI reuse it; in live mode open the confirm Modal first. On success → `fetchPortfolio()` + inline success + `toast.success`; on error → inline + `toast.error`.

## 5. File ownership (workflow)
- **Phase 1 — Pieces (parallel):**
  - `pieces`: `components/trading/{MarketWatchlist,TradeChart,OrderSummary,PositionContext}.jsx`.
  - `inrinput`: `components/common/INRInput.jsx` (fix #1 only; keep props).
- **Phase 2 — Assemble (after Phase 1):**
  - `assemble`: `components/trading/TradePanel.jsx` + `pages/Trade.jsx`. READ the Phase-1 components first for their exact props, then build the redesigned ticket + 3-pane page per §2/§4.

## 6. Self-check
(a) INRInput can be cleared and retyped, and still updates from external setters; (b) symbol is controlled by the page and the watchlist/chart/ticket stay in sync; (c) Follow-AI places/sells correctly and is disabled with a reason when not actionable; (d) SELL disabled w/ reason when no position; (e) live REAL MONEY confirm + toasts + portfolio refresh preserved; (f) responsive 3→1 column; (g) no new deps; valid JSX; passes `vite build`.

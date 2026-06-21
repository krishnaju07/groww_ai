# GrowwAI — UX Upgrade Spec: Guidance · Toasts · Mobile · Power-Nav

> Read in full before building. This builds on the existing "glass + glow" system
> (`DESIGN.md`, `client/src/lib/ui.js`, primitives `AnimatedNumber`/`Sparkline`/`Skeleton`).
> It ADDS UX features. It must not break existing behavior.

## 0. Hard rules

1. **Preserve all existing component props, exports, and data wiring** (stores, services, hooks, useEffect, handlers). When editing an existing file you ADD to it — never remove its current behavior (ticker, portfolio total, mode toggle, nav links, trade flow, polling, etc.).
2. **Reuse the design system**: import recipes from `lib/ui.js` (`GLASS_CARD`, `GLASS_CARD_HOVER`, `GLASS_PANEL`, `GRADIENT_TEXT`, `BTN_PRIMARY`, `BTN_GHOST`, `BTN_DANGER`, `PILL`, `LABEL`, `NUM`, `cx`) and primitives. Numbers carry `num`. Accent green `#00C853`/`#00E676`, danger `#FF5252`.
3. **No new dependencies.** Build the command palette, drawer, tooltip, toasts with plain React + Tailwind + `lucide-react` + `recharts`. No cmdk/react-hot-toast/headlessui.
4. **Do NOT modify** off-limits data files: `store/use{Stocks,Portfolio,Settings,Signals,TradingMode}Store.js`, `services/*`, `lib/api.js`, `lib/format.js`, `types.js`, `lib/ui.js`, `tailwind.config.js`, `index.css`, the three primitives, and all `server/*`. (You MAY add the two NEW stores listed in §5.) Import the existing ones to read data.
5. **Mobile-first & accessible**: every interactive element is keyboard-reachable (button/`tabIndex`), has a visible focus ring (`focus-visible:ring-2 focus-visible:ring-accent/50`), and respects `prefers-reduced-motion` for big motion. Overlays close on `Esc` and on backdrop click.
6. Each file must remain valid JSX and survive `vite build`.

## 1. New global state stores (created by the Foundation phase)

### `store/useUiStore.js`
Coordinates overlays + mobile nav.
```
{
  paletteOpen: false,
  openPalette(), closePalette(), togglePalette(),
  drawerSymbol: null,            // null = closed; else canonical symbol shown in StockDrawer
  openStock(symbol), closeStock(),
  mobileNavOpen: false,
  openMobileNav(), closeMobileNav(), toggleMobileNav(),
}
```

### `store/useToastStore.js`
```
{
  toasts: [],                    // { id:string, type:'success'|'error'|'info'|'auto', title:string, message?:string }
  push({ type, title, message }) -> id,   // auto-dismiss after ~4500ms (store sets a timeout, calls dismiss)
  dismiss(id),
}
```
Also export a convenience helper so non-component code can fire toasts:
```js
export const toast = {
  success: (title, message) => useToastStore.getState().push({ type: 'success', title, message }),
  error:   (title, message) => useToastStore.getState().push({ type: 'error', title, message }),
  info:    (title, message) => useToastStore.getState().push({ type: 'info', title, message }),
  auto:    (title, message) => useToastStore.getState().push({ type: 'auto', title, message }),
};
```
(Use a module-level counter for ids — do NOT rely on Date.now/Math.random uniqueness alone; `id = String(++counter)` is fine.)

## 2. New primitives (Foundation phase) — `components/common/`

- **`ToastContainer.jsx`** (no props) — fixed `bottom-4 right-4 z-[60]` stack; each toast is a `GLASS_CARD`-style card with a left accent bar colored by type (success=accent, error=danger, info=info, auto=accent2 with a `Zap` icon), title + optional message, a close `X`, entrance `animate-fade-in-up`. Reads `useToastStore`. Mounted once in `Layout`.
- **`Tooltip.jsx`** `{ content, children, side? /* 'top'|'bottom' */ }` — wraps children; on hover/focus shows a small glass bubble (`GLASS_PANEL`, `text-xs`, `max-w-[220px]`, `z-50`) positioned above/below. Keyboard-focusable trigger. Pure CSS/group or minimal state.
- **`InfoHint.jsx`** `{ text, side? }` — a muted `Info` (lucide) icon (size 14) wrapped in `Tooltip` with `content={text}`. Use inline next to labels needing explanation.
- **`EmptyState.jsx`** `{ icon, title, message, action? }` — centered column: icon in a glass chip with soft glow, `font-display` title, muted message, optional `action` node (e.g. a `BTN_PRIMARY` link/button). Used inside cards/tables when there's no data.

## 3. New hooks (Foundation phase) — `hooks/`

- **`useMediaQuery.js`** — `export function useMediaQuery(query)` → boolean (SSR-safe, listens to changes). `export function useIsMobile()` → `useMediaQuery('(max-width: 767px)')`.
- **`useAutoTradeToasts.js`** — `export function useAutoTradeToasts()`: polls `tradesService.getTrades({ type:'automatic', limit:5 })` every ~20s; tracks the latest-seen trade id in a ref (seed from the first fetch WITHOUT toasting historical trades); for each genuinely new automatic trade, fires `toast.auto('Auto ' + action + ' ' + symbol, '<qty> @ <formatINR(price)>')`. Returns nothing. Mounted once in `Layout`. Must never throw (wrap in try/catch).

## 4. New feature components

- **`components/common/CommandPalette.jsx`** (no props) — global ⌘K palette. Open state from `useUiStore.paletteOpen`. Backdrop `bg-black/60 backdrop-blur-sm` (fade-in) + centered glass panel near top. A search `<input>` (autofocus on open). Result groups:
  - **Stocks** — filter `useStocksStore.stocks` by query (symbol/name); on select → `useUiStore.openStock(symbol)` + close palette. (Call `fetchStocks()` on mount if empty.)
  - **Navigation** — Dashboard `/`, Portfolio `/portfolio`, Trade `/trade`, Settings `/settings`, Backtest `/backtest` via `useNavigate`; on select → navigate + close.
  Keyboard: `↑/↓` move the highlighted item across the flattened result list, `Enter` runs it, `Esc` closes, typing filters. Highlighted row uses an accent tint. Empty query shows navigation + a few top stocks.
- **`components/common/StockDrawer.jsx`** (no props) — right slide-in panel (`fixed inset-y-0 right-0 w-full sm:w-[420px] z-[55]`, glass, translate-x transition) when `useUiStore.drawerSymbol` is set; backdrop closes it. Shows: stock name + `AnimatedNumber` price + colored change (from `useStocksStore`); a `Sparkline` (or small recharts area) of recent history fetched via `stocksService.getHistory(symbol, 30)` (map closes); the AI signal by REUSING the existing `SignalCard` (fetch via `useSignalsStore.fetchSignal(symbol)`); and an "Open in Trade →" `BTN_PRIMARY` that navigates to `/trade` and closes the drawer. `Esc` closes.
- **`components/common/WelcomeModal.jsx`** (no props) — first-visit only (gate on `localStorage['growwai_onboarded']`; set it when dismissed). Uses the existing `Modal`. A 3-point intro: (1) Paper trading with ₹10L virtual cash, (2) AI signals + auto invest/exit, (3) Real-money mode is opt-in & safety-gated. A `BTN_PRIMARY` "Get started" that dismisses. Renders nothing once onboarded. Mounted in `Layout`.
- **`components/layout/NotificationsBell.jsx`** (no props) — a `Bell` icon button in the navbar; on click opens a glass popover (absolute, right-aligned) listing the latest ~8 trades from `tradesService.getTrades({ limit: 8 })` (fetch on open), each row: action arrow + symbol + qty + `formatINR(price)` + `AutoBadge` + relative-ish time (`formatDateTime`). A small accent dot when there are recent automatic trades. Empty → small "No activity yet". Closes on outside click / `Esc`.

## 5. Responsive + sorting upgrades to existing components

- **Tables → cards on mobile**: `PositionsTable` and `RecentTradesTable` render the existing `<table>` inside `hidden md:block`, and ADD a `md:hidden` stacked **card list** (one `GLASS_PANEL` card per row with the same fields, labelled). Keep the same props (`PositionsTable({positions,onClose,closing})`, `RecentTradesTable({trades})`) and all handlers.
- **Sorting**: `PositionsTable` — clickable column headers (Symbol, P&L, Value, Unrealized %) toggle asc/desc via local `useState`; show a `ChevronUp/Down` on the active column; sort a COPY of `positions` (never mutate props). `RecentTradesTable` — add small filter chips **All / Manual / Auto** (local state) that filter the `trades` prop before render; default All.
- **Empty states**: use `EmptyState` when data is empty — `PositionsTable` (no positions → "No open positions" + "Place a trade" link to `/trade`), `RecentTradesTable` (no trades → "No trades yet"), `Dashboard` equity curve area already handled by `EquityCurve`'s empty state (leave), `Backtest` (before first run → hint to configure & Run).

## 6. Guidance / tooltips placement

Add `InfoHint` next to: the AI-signal confidence (SignalCard) — "AI confidence 0–100 from RSI, MACD, momentum, trend & volume."; AutoInvestSettings confidence threshold — "Auto-invest only triggers on BUY signals at/above this confidence."; AutoExitSettings stop-loss/take-profit/trailing — one concise hint each; (the paper-vs-live hint already exists in the TradingModeToggle modal). Keep microcopy short.

## 7. Toast wiring into existing flows

- `TradePanel` — after a successful trade also `toast.success('Order placed', '<verb> <qty> <symbol> @ <price>')`; on error `toast.error('Trade failed', message)`. KEEP the existing inline `result` banner too.
- `Settings` — on save success `toast.success('Settings saved')`; on error `toast.error('Save failed', message)`. KEEP inline banners + the writable-subset patch.
- `TradingModeToggle` — on successful switch `toast.info('Switched to ' + mode + ' mode')` (or `toast.error` on failure). KEEP existing modals.

## 8. Layout / Navbar / Sidebar integration

- **`Layout.jsx`** — mount once: `<ToastContainer/>`, `<CommandPalette/>`, `<StockDrawer/>`, `<WelcomeModal/>`; call `useAutoTradeToasts()`. Add a global `keydown` listener: `⌘K`/`Ctrl+K` → `useUiStore.togglePalette()` (preventDefault); `/` (when not typing in an input) → open palette too. On mobile, render the `Sidebar` as a slide-in **drawer** controlled by `useUiStore.mobileNavOpen` with a backdrop; on `md+` keep the static sidebar. Keep the existing `<Outlet/>` + `animate-fade-in-up` main wrapper.
- **`Navbar.jsx`** — ADD (preserve everything existing): a **hamburger** button (`Menu` icon, `md:hidden`) → `useUiStore.toggleMobileNav()`; a compact **⌘K search button** ("Search…  ⌘K", hidden on small) → `useUiStore.openPalette()`; the `<NotificationsBell/>`. Keep brand, ticker, portfolio total, day P&L, and `<TradingModeToggle/>`.
- **`Sidebar.jsx`** — keep the nav links/active styling; ensure nav items call `useUiStore.closeMobileNav()` on click (so the mobile drawer closes after navigation). Optionally show a small "⌘K" hint at the bottom.

## 9. File ownership (workflow)

**Foundation (phase 1, one agent — NEW files only):** `store/useUiStore.js`, `store/useToastStore.js`, `hooks/useMediaQuery.js`, `hooks/useAutoTradeToasts.js`, `components/common/{ToastContainer,Tooltip,InfoHint,EmptyState}.jsx`.

**Features (phase 2, parallel):**
- `feat-overlays`: `components/common/{CommandPalette,StockDrawer,WelcomeModal}.jsx`, `components/layout/Layout.jsx`.
- `feat-nav`: `components/layout/Navbar.jsx`, `components/layout/Sidebar.jsx`, `components/layout/NotificationsBell.jsx`.
- `feat-tables`: `components/trading/PositionsTable.jsx`, `components/dashboard/RecentTradesTable.jsx`.
- `feat-empty-help`: `pages/Portfolio.jsx`, `pages/Dashboard.jsx`, `pages/Backtest.jsx`, `components/trading/SignalCard.jsx`, `components/settings/AutoInvestSettings.jsx`, `components/settings/AutoExitSettings.jsx`.
- `feat-toasts`: `components/trading/TradePanel.jsx`, `pages/Settings.jsx`, `components/common/TradingModeToggle.jsx`.

No file is owned by two groups. Phase-2 agents import the Phase-1 stores/primitives by the exact names above.

## 10. Self-check (every agent)

(a) existing props/exports/data-wiring preserved; (b) imports the design-system recipes + the new stores/primitives by the contract names; (c) keyboard-accessible + focus rings on new controls; (d) `Esc`/backdrop closes overlays; (e) numbers carry `num`; (f) no new deps; (g) valid JSX, would pass `vite build`.

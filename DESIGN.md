# GrowwAI — UI Redesign Spec: "Modern Fintech (Glass + Glow)"

> Read this in full before restyling. This is a **presentation-only** overhaul. The
> app already works end-to-end. You are upgrading the *look*, not the behavior.

## 0. Hard rules (do not break the app)

1. **Keep every component's exported name and its props EXACTLY** as defined in `CONTRACT.md` §15 (and page contents per §16). Each restyled file must be a **drop-in replacement** — same default export, same prop names, same call signatures.
2. **Preserve ALL data wiring**: every store hook (`useStocksStore`, `usePortfolioStore`, `useSettingsStore`, `useSignalsStore`), service call, custom hook (`usePolling`, …), `useEffect`, event handler, and state must remain. **Only rewrite the returned JSX and styling.** Treat this as a restyle, never a logic rewrite.
3. **Do NOT modify** (off-limits): `client/src/store/*`, `client/src/services/*`, `client/src/hooks/*`, `client/src/lib/api.js`, `client/src/lib/format.js`, `client/src/types.js`, `client/src/lib/ui.js`, `client/src/components/common/{AnimatedNumber,Sparkline,Skeleton}.jsx`, `client/tailwind.config.js`, `client/src/index.css`, `client/src/main.jsx`, and all `server/*`. These are the provided design-system + data layers — **import and use them**.
4. **No new dependencies.** Use Tailwind, the provided recipes/primitives, `recharts`, and `lucide-react` (already installed).
5. Every file stays valid JSX and must survive `vite build`.

## 1. The visual language

Deep near-black canvas with an ambient green/blue radial glow (already on `body`). Content sits on **frosted-glass cards** — translucent white film, blur, hairline border, soft shadow — that **lift and glow accent-green on hover**. Accent is Groww green `#00C853 → #00E676` gradient. Big numbers are bold, tabular, slightly glowing. Motion is subtle: count-ups, fade-in-up on mount, smooth hovers. Think premium consumer fintech (Groww × Robinhood × Cred), not a noisy terminal.

**Tokens** (Tailwind, already configured): colors `accent #00C853`, `accent2 #00E676`, `danger #FF5252`, `warn #FFB020`, `info #3B82F6`, `bg #0A0D12`, `surface #121821`, `border`, `muted #8B97A7`, `text #E6E8EB`. Shadows `shadow-glow`, `shadow-glow-lg`, `shadow-card`. Fonts `font-sans` (Inter), `font-display` (Sora — use for big headings/brand). Animations `animate-fade-in-up`, `animate-fade-in`, `animate-float`, `animate-glow-pulse`, `animate-shimmer`, `animate-marquee`.

## 2. Reusable recipes — import from `client/src/lib/ui.js`

`GLASS_CARD`, `GLASS_CARD_HOVER`, `GLASS_PANEL`, `GRADIENT_TEXT`, `GRADIENT_ACCENT`, `GLOW_ACCENT`, `GLOW_DANGER`, `BTN_PRIMARY`, `BTN_GHOST`, `BTN_DANGER`, `PILL`, `LABEL` (uppercase small-caps section label), `NUM`, and `cx(...parts)` (className combiner). Import with the correct relative depth (e.g. from `components/common/` → `../../lib/ui`).

Always put the `num` class (or `NUM`) on numeric values for tabular alignment. Use `formatINR`/`formatPercent`/`pnlColorClass`/`formatDateTime` from `../../lib/format`.

## 3. Primitives — import from `components/common/`

- **`AnimatedNumber`** `{ value, format, duration?, className? }` — count-up figure. Use for every live headline number (portfolio value, P&L, cash, prices, backtest metrics). `format` gets the number → return e.g. `formatINR(n)`.
- **`Sparkline`** `{ data:number[], color?, width?, height?, fill?, dot?, className? }` — tiny inline trend chart. Use in StatTiles, signal rows, ticker. Green `#00E676` for up, `#FF5252` for down.
- **`Skeleton`** `{ className, rounded? }` — shimmer placeholder. Use for ALL loading states instead of a bare spinner (compose sizes: `<Skeleton className="h-8 w-32" />`).

## 4. Per-component direction (props stay per CONTRACT §15)

**common/**
- `Card` — `GLASS_CARD` (or `GLASS_CARD_HOVER` when interactive), `p-5 rounded-2xl`; `title` rendered with `LABEL`; optional `subtitle` (muted); `action` top-right; thin top sheen optional.
- `Badge` — `PILL` with variant: success=`bg-accent/12 text-accent border border-accent/25`, danger=`bg-danger/12 text-danger border-danger/25`, info=`bg-info/12 text-info border-info/25`, neutral=`bg-white/5 text-muted border-white/10`.
- `SignalBadge` — BUY = accent gradient pill + `TrendingUp` icon + soft glow; SELL = danger pill + `TrendingDown`; HOLD = neutral + `Minus`. Append `confidence%` when provided.
- `AutoBadge` — `manual` = subtle white/muted pill "MANUAL"; `automatic` = info pill "AUTO" with a `Zap`/`Bot` icon.
- `ToggleSwitch` — pill track; OFF = `bg-white/10`, ON = `GRADIENT_ACCENT` + `shadow-glow`; knob slides with `transition`; optional `label` to the left; respects `disabled`.
- `Spinner` — gradient conic/ring spinner; sizes sm/md/lg.
- `Modal` — fixed inset, `bg-black/60 backdrop-blur-sm` overlay (fade-in), centered `GLASS_CARD` panel (`animate-fade-in-up`), `title` + close `X` (lucide), `children` body.
- `INRInput` — `GLASS_PANEL` field, leading `₹`, `num` value, focus ring `ring-2 ring-accent/40 border-accent/40`; when out of `[min,max]` show `error`/range message in `text-danger` and red border.
- `ConfidenceMeter` — **circular SVG gauge** 0..100: track ring + accent-gradient progress arc with glow, center shows `score` (`num`, gradient text for high scores). `size` sm/md. (A gradient bar is an acceptable fallback, but prefer the gauge.)
- `RangeSlider` — styled `<input type=range>`: track shows accent-gradient fill up to value, glowing thumb; `label` left + current `value` chip right (use `format` if given).
- `StatTile` — hero tile: `GLASS_CARD_HOVER p-5`; top row `label` (`LABEL`) + optional `icon` in a glass chip; big `value` (already a formatted string — render large, `num`, `font-display`); optional `delta` colored by `deltaPositive` with ▲/▼; subtle. (StatTile receives a preformatted string `value`; do not re-animate here unless you also accept numbers — keep the existing prop contract.)

**layout/**
- `Navbar` — sticky top glass bar: brand "GrowwAI" with a glowing gradient logo mark (use the existing icon) + `font-display`; a **horizontally scrolling live ticker** of universe prices (read `useStocksStore` — call `fetchStocks()` on mount; map `stocks` to symbol + price + colored change; `animate-marquee`, duplicate the list for a seamless loop, `no-scrollbar`); right side: portfolio total from `usePortfolioStore` (use `AnimatedNumber`) + a market-status dot (`animate-glow-pulse`, green=open) with "Live"/"Closed".
- `Sidebar` — glass vertical rail: brand at top; nav links (`react-router NavLink`) with lucide icons (LayoutDashboard, Wallet, TrendingUp, Settings, FlaskConical); active = accent gradient tint + left glow bar + accent text; hover = `bg-white/5`; footer "Paper trading only · No real money".
- `Layout` — flex shell: `Sidebar` (fixed width) + right column with `Navbar` (sticky) and a scrollable `<main>` containing a `max-w-[1400px] mx-auto p-6` wrapper around `<Outlet/>`, wrapped in `animate-fade-in-up`.

**dashboard/**
- `PortfolioSummaryBar` — responsive grid (`grid-cols-2 lg:grid-cols-4 gap-4`) of `StatTile`s: Total Value, Day P&L (delta+color), Total P&L (delta+color), Cash. Format with `formatINR`/`formatPercent`.
- `EquityCurve` — Recharts `AreaChart`: accent gradient area (`#00C853` → transparent), glowing 2px line, hidden/sparse axes, a **custom dark glass tooltip**, `CartesianGrid` very faint. Styled empty state ("No equity data yet") when `data` empty.
- `SignalPanel` — list of glass rows: symbol + `SignalBadge` + small `ConfidenceMeter` + reason (truncate). Highlight the top row with an accent ring.
- `RecentTradesTable` — glass table: cols Symbol, Type(`AutoBadge`), Action(▲/▼ colored), Qty, Price, P&L(colored `num`), Time(`formatDateTime`). Row hover `bg-white/[0.03]`; styled empty state.
- `AutoStatusCards` — two glass cards (Auto Invest / Auto Exit): status dot + ON/OFF, last-trade line / active-rules count; ON state gets an accent ring + `shadow-glow`.
- `pages/Dashboard` — header: `font-display` title "Dashboard" + a "Live" pill (glow-pulse). While loading, render `Skeleton` placeholders matching the layout (not a bare spinner). Keep the existing fetch + `usePolling(…, 10000)`.

**trading/**
- `StockSelector` — custom glass select (or styled `<select>`): shows symbol + name + live price/change for the chosen stock.
- `SignalCard` — glass card: large `SignalBadge`, `ConfidenceMeter`, a 2×2 mini-grid of indicators (RSI, MACD, Momentum, Volume) in `GLASS_PANEL` chips, and the `reason`. `loading` → `Skeleton`s.
- `TradePanel` — premium glass form: segmented BUY/SELL toggle (BUY=accent, SELL=danger), `StockSelector`, big live price (`AnimatedNumber`), `INRInput` (min/max from settings), a "≈ N shares" preview chip, embedded `SignalCard`, `BTN_PRIMARY` submit ("Place BUY/SELL"); inline success (accent glass) / error (danger glass). Keep all existing handlers + portfolio refresh.
- `PositionsTable` — glass table, cols per §16 (Symbol, Qty, Avg, LTP, Invested, Value, P&L colored, Unrealized %, trailing-stop chip), `Close` = `BTN_DANGER` (spinner when `closing===symbol`); hover rows; styled empty state.
- `pages/Portfolio` — header + total P&L summary strip; `PositionsTable`; `Skeleton` while loading; keep poll.
- `pages/Trade` — two-column on large screens: `TradePanel` + a side panel (live `SignalCard` / market list) if convenient; keep stocks+settings loading.

**settings/**
- `InvestmentLimits`, `AutoInvestSettings`, `AutoExitSettings` — each a `Card` with `LABEL` heading, `RangeSlider`s with live value chips, `ToggleSwitch`es; the Auto* cards get an accent ring + `shadow-glow` when their toggle is enabled.
- `pages/Settings` — header + `BTN_PRIMARY` Save (spinner while saving); success/error as accent/danger glass banners; keep the writable-subset patch logic already in place.
- `pages/Backtest` — glass form (StockSelector, styled date inputs, glass number inputs, `RangeSlider`s) + `BTN_PRIMARY` Run; results = a row of `StatTile`s (Total Return %, Max Drawdown, Win Rate, Sharpe, # Trades) + an `EquityCurve` of `result.equityCurve` + a glass trade-log table. `Skeleton` while running.

## 5. File ownership (workflow groups — restyle only these; data files are off-limits)

- **ui-common**: `client/src/components/common/{Card,Badge,SignalBadge,AutoBadge,ToggleSwitch,Spinner,Modal,INRInput,ConfidenceMeter,RangeSlider,StatTile}.jsx` (NOT AnimatedNumber/Sparkline/Skeleton — provided; import them).
- **ui-layout**: `client/src/components/layout/{Navbar,Sidebar,Layout}.jsx`.
- **ui-dashboard**: `client/src/components/dashboard/{PortfolioSummaryBar,EquityCurve,SignalPanel,RecentTradesTable,AutoStatusCards}.jsx`, `client/src/pages/Dashboard.jsx`.
- **ui-trading**: `client/src/components/trading/{StockSelector,SignalCard,TradePanel,PositionsTable}.jsx`, `client/src/pages/{Portfolio,Trade}.jsx`.
- **ui-settings**: `client/src/components/settings/{InvestmentLimits,AutoInvestSettings,AutoExitSettings}.jsx`, `client/src/pages/{Settings,Backtest}.jsx`.

## 6. Self-check before returning

Each restyled file: (a) same default export + props as CONTRACT §15/§16; (b) all store/service/hook/handler/`useEffect` logic preserved; (c) imports recipes from `../../lib/ui` and primitives/format as needed; (d) numbers carry `num`; (e) valid JSX, no removed functionality, no new deps; (f) would pass `vite build`.

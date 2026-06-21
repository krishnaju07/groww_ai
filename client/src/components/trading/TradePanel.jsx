import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Zap,
  Layers,
  Sparkles,
} from 'lucide-react';
import StockSelector from './StockSelector';
import PositionContext from './PositionContext';
import OrderSummary from './OrderSummary';
import INRInput from '../common/INRInput';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import AnimatedNumber from '../common/AnimatedNumber';
import Skeleton from '../common/Skeleton';
import useStocksStore from '../../store/useStocksStore';
import useSettingsStore from '../../store/useSettingsStore';
import useSignalsStore from '../../store/useSignalsStore';
import usePortfolioStore from '../../store/usePortfolioStore';
import useTradingModeStore from '../../store/useTradingModeStore';
import { toast } from '../../store/useToastStore';
import { executeManualTrade } from '../../services/trades.service';
import { formatINR } from '../../lib/format';
import {
  GLASS_CARD,
  GLASS_PANEL,
  GRADIENT_TEXT,
  BTN_PRIMARY,
  BTN_GHOST,
  LABEL,
  NUM,
  cx,
} from '../../lib/ui';

/** Slippage buffer so the server's floor(amount/fillPrice) lands on the wanted qty. */
const SLIPPAGE_BUFFER = 1.004;

/**
 * Clamp `n` into the inclusive `[min, max]` range, guarding non-finite bounds.
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(n, min, max) {
  let v = n;
  if (Number.isFinite(min)) v = Math.max(v, min);
  if (Number.isFinite(max)) v = Math.min(v, max);
  return Math.round(v);
}

/**
 * A small quick-amount chip that sets the amount when clicked.
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.value     Amount to apply.
 * @param {boolean} props.active   Whether the current amount equals this chip.
 * @param {(v:number)=>void} props.onClick
 * @returns {JSX.Element}
 */
function AmountChip({ label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      aria-pressed={active}
      className={cx(
        'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        active
          ? 'border-accent/40 bg-accent/12 text-accent'
          : 'border-white/10 bg-white/[0.03] text-muted hover:border-white/20 hover:text-text',
      )}
    >
      {label}
    </button>
  );
}

/**
 * TradePanel — premium glass order ticket for a single (page-controlled) symbol.
 *
 * Flow: BUY/SELL toggle → enter an order by amount (with quick-amount chips) or
 * by shares (qty → amount) → review your position + the estimated cost/proceeds
 * → place it manually, or one-click "Follow AI" to execute the stock's signal.
 * Both paths funnel through `submit(overrideAction?)`, which honors the live-mode
 * REAL MONEY confirm Modal, calls `executeManualTrade`, refreshes the portfolio,
 * and surfaces an inline banner + toast.
 *
 * @param {Object} props
 * @param {string} props.symbol                      Selected symbol (controlled by the page).
 * @param {(symbol:string)=>void} props.onSymbolChange  Lift symbol changes to the page.
 * @returns {JSX.Element}
 */
export default function TradePanel({ symbol, onSymbolChange }) {
  const stocks = useStocksStore((s) => s.stocks);
  const stocksLoading = useStocksStore((s) => s.loading);

  const settings = useSettingsStore((s) => s.settings);

  const signals = useSignalsStore((s) => s.signals);
  const fetchSignal = useSignalsStore((s) => s.fetchSignal);

  const cashBalance = usePortfolioStore((s) => s.summary?.cashBalance);
  const positions = usePortfolioStore((s) => s.positions);
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio);

  const tradingStatus = useTradingModeStore((s) => s.status);
  const fetchTradingStatus = useTradingModeStore((s) => s.fetchStatus);
  const isLiveMode = (tradingStatus ? tradingStatus.mode : 'paper') === 'live';

  const [action, setAction] = useState(/** @type {'BUY'|'SELL'} */ ('BUY'));
  const [mode, setMode] = useState(/** @type {'amount'|'shares'} */ ('amount'));
  const [amount, setAmount] = useState(0);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(
    /** @type {{type:'success'|'error',message:string}|null} */ (null),
  );
  const [confirmLiveOpen, setConfirmLiveOpen] = useState(false);
  // Action to actually submit when the live-mode confirm Modal is accepted.
  const [pendingAction, setPendingAction] = useState(/** @type {'BUY'|'SELL'} */ ('BUY'));

  const minInvestment = settings ? settings.minInvestment : 5000;
  const maxInvestment = settings ? settings.maxInvestment : 50000;
  const cash = Number.isFinite(cashBalance) ? cashBalance : 0;

  const selectedStock = useMemo(
    () => (Array.isArray(stocks) ? stocks.find((s) => s.symbol === symbol) : null) || null,
    [stocks, symbol],
  );
  const price = selectedStock ? selectedStock.price : 0;
  const signal = signals[symbol] || null;

  const position = useMemo(
    () =>
      (Array.isArray(positions) ? positions.find((p) => p.symbol === symbol) : null) || null,
    [positions, symbol],
  );

  // Seed the amount to the minimum once settings arrive.
  useEffect(() => {
    if (settings && amount === 0) {
      setAmount(settings.minInvestment);
    }
  }, [settings, amount]);

  useEffect(() => {
    fetchTradingStatus();
  }, [fetchTradingStatus]);

  // Fetch the AI signal for the selected symbol if we don't have it yet.
  useEffect(() => {
    if (!symbol || signals[symbol]) return;
    fetchSignal(symbol).catch(() => {
      /* signal is optional; trading still works without it */
    });
  }, [symbol, signals, fetchSignal]);

  // In By-Shares mode, derive the amount from qty (with a slippage buffer so the
  // server fills the requested whole-share count).
  useEffect(() => {
    if (mode !== 'shares' || action !== 'BUY') return;
    if (!(price > 0)) return;
    const q = Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1;
    setAmount(Math.ceil(q * price * SLIPPAGE_BUFFER));
  }, [mode, action, qty, price]);

  // Estimated whole-share count (matches server: floor(amount / price)).
  const estShares =
    price > 0 && Number.isFinite(amount) ? Math.floor(amount / price) : 0;

  const amountValid =
    Number.isFinite(amount) && amount >= minInvestment && amount <= maxInvestment;

  const isBuy = action === 'BUY';

  // Quick-amount chips, all clamped to the [min,max] settings window.
  const quickChips = useMemo(() => {
    const mid = Math.round((minInvestment + maxInvestment) / 2);
    const maxBuyable = clamp(Math.min(maxInvestment, cash), minInvestment, maxInvestment);
    /** @type {Array<{label:string,value:number}>} */
    const chips = [
      { label: formatINR(minInvestment), value: clamp(minInvestment, minInvestment, maxInvestment) },
      { label: formatINR(mid), value: clamp(mid, minInvestment, maxInvestment) },
      { label: '25%', value: clamp(cash * 0.25, minInvestment, maxInvestment) },
      { label: '50%', value: clamp(cash * 0.5, minInvestment, maxInvestment) },
      { label: 'Max', value: maxBuyable },
    ];
    // De-dup identical values (e.g. when cash is tiny everything clamps to min).
    const seen = new Set();
    return chips.filter((c) => {
      if (seen.has(c.value)) return false;
      seen.add(c.value);
      return true;
    });
  }, [minInvestment, maxInvestment, cash]);

  const sharesNeedAmount =
    mode === 'shares' && price > 0 ? Math.ceil((Number.isFinite(qty) ? qty : 0) * price * SLIPPAGE_BUFFER) : 0;
  const sharesExceedMax = mode === 'shares' && sharesNeedAmount > maxInvestment;

  // BUY is placeable when the amount is in range and buys at least one share;
  // SELL is placeable only when a position exists.
  const buyPlaceable = amountValid && estShares >= 1;
  const sellPlaceable = Boolean(position);

  let placeDisabledReason = '';
  if (!symbol) {
    placeDisabledReason = 'Select a stock';
  } else if (isBuy) {
    if (!amountValid) {
      placeDisabledReason = `Enter an amount between ${formatINR(minInvestment)} and ${formatINR(maxInvestment)}`;
    } else if (estShares < 1) {
      placeDisabledReason = `${formatINR(amount)} buys 0 shares`;
    }
  } else if (!sellPlaceable) {
    placeDisabledReason = `No position in ${symbol}`;
  }

  const placeable = isBuy ? buyPlaceable : sellPlaceable;
  const canPlace = Boolean(symbol) && !submitting && placeable;

  // ---- Follow-AI gating ----
  const sig = signal;
  let aiDisabledReason = '';
  if (!sig) {
    aiDisabledReason = 'AI signal loading';
  } else if (sig.signal === 'HOLD') {
    aiDisabledReason = 'AI suggests HOLD — no action';
  } else if (sig.signal === 'SELL' && !position) {
    aiDisabledReason = 'No position to sell';
  } else if (sig.signal === 'BUY' && !buyPlaceable) {
    aiDisabledReason = amountValid
      ? `${formatINR(amount)} buys 0 shares`
      : `Set an amount between ${formatINR(minInvestment)} and ${formatINR(maxInvestment)}`;
  }
  const canFollowAi = Boolean(sig) && !submitting && !aiDisabledReason;

  const handleSymbolChange = (next) => {
    if (typeof onSymbolChange === 'function') onSymbolChange(next);
    setResult(null);
  };

  const handleActionChange = (next) => {
    setAction(next);
    setResult(null);
    if (next === 'SELL') setMode('amount');
  };

  /**
   * Execute the order (used by both Place and Follow-AI). When `overrideAction`
   * is supplied (Follow-AI), it wins over the current toggle.
   * @param {'BUY'|'SELL'} [overrideAction]
   * @returns {Promise<void>}
   */
  const doSubmit = async (overrideAction) => {
    const effectiveAction = overrideAction || action;
    setConfirmLiveOpen(false);
    setSubmitting(true);
    setResult(null);
    try {
      const trade = await executeManualTrade({
        symbol,
        action: effectiveAction,
        investmentAmount: Number(amount),
      });
      await fetchPortfolio();
      const verb = trade.action === 'BUY' ? 'Bought' : 'Sold';
      const successMessage = `${verb} ${trade.quantity} ${trade.symbol} @ ${formatINR(
        trade.price,
      )} (${formatINR(trade.investmentAmount)})`;
      setResult({ type: 'success', message: successMessage });
      toast.success('Order placed', successMessage);
    } catch (err) {
      const errorMessage = err && err.message ? err.message : 'Trade failed.';
      setResult({ type: 'error', message: errorMessage });
      toast.error('Trade failed', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Submit entry point shared by Place + Follow-AI. In live mode it opens the
   * REAL MONEY confirm Modal first (remembering which action to run).
   * @param {'BUY'|'SELL'} [overrideAction]
   */
  const submit = (overrideAction) => {
    const effectiveAction = overrideAction || action;
    if (isLiveMode) {
      setPendingAction(effectiveAction);
      setConfirmLiveOpen(true);
      return;
    }
    doSubmit(effectiveAction);
  };

  const handlePlace = () => {
    if (!canPlace) return;
    submit(action);
  };

  const handleFollowAi = () => {
    if (!canFollowAi || !sig) return;
    const next = sig.signal === 'SELL' ? 'SELL' : 'BUY';
    setAction(next);
    if (next === 'SELL') setMode('amount');
    submit(next);
  };

  if (stocksLoading && (!stocks || stocks.length === 0)) {
    return (
      <div className={cx(GLASS_CARD, 'space-y-4 p-5')}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-11 w-full" rounded="rounded-xl" />
        <Skeleton className="h-12 w-full" rounded="rounded-xl" />
        <Skeleton className="h-11 w-full" rounded="rounded-xl" />
        <Skeleton className="h-24 w-full" rounded="rounded-xl" />
        <Skeleton className="h-11 w-full" rounded="rounded-xl" />
      </div>
    );
  }

  const confirmIsBuy = pendingAction === 'BUY';

  return (
    <div className={cx(GLASS_CARD, 'p-5')}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-text">Place Order</h3>
          <p className="mt-0.5 text-xs text-muted">
            {isLiveMode ? 'Real-money order via Groww' : 'Manual paper trade'}
          </p>
        </div>
      </div>

      {isLiveMode && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-semibold text-danger">
          <AlertTriangle size={16} className="shrink-0" />
          REAL MONEY — this order executes on your Groww account.
        </div>
      )}

      <div className="flex flex-col gap-4">
        <StockSelector stocks={stocks} value={symbol} onChange={handleSymbolChange} />

        {/* Live price */}
        <div className={cx(GLASS_PANEL, 'flex items-center justify-between px-4 py-3')}>
          <span className={LABEL}>Live Price</span>
          {price > 0 ? (
            <AnimatedNumber
              value={price}
              format={formatINR}
              className={cx('text-lg font-bold', GRADIENT_TEXT)}
            />
          ) : (
            <span className={cx(NUM, 'text-lg font-bold text-muted')}>—</span>
          )}
        </div>

        {/* BUY / SELL segmented toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          <button
            type="button"
            onClick={() => handleActionChange('BUY')}
            aria-pressed={isBuy}
            className={cx(
              'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              isBuy
                ? 'bg-gradient-to-r from-[#00C853] to-[#00E676] text-[#04210F] shadow-[0_4px_16px_-4px_rgba(0,200,83,0.5)]'
                : 'text-muted hover:text-text',
            )}
          >
            <TrendingUp size={16} strokeWidth={2.5} />
            BUY
          </button>
          <button
            type="button"
            onClick={() => handleActionChange('SELL')}
            aria-pressed={!isBuy}
            className={cx(
              'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50',
              !isBuy
                ? 'bg-gradient-to-r from-danger to-[#FF7B7B] text-[#2A0B0B] shadow-[0_4px_16px_-4px_rgba(255,82,82,0.5)]'
                : 'text-muted hover:text-text',
            )}
          >
            <TrendingDown size={16} strokeWidth={2.5} />
            SELL
          </button>
        </div>

        {isBuy ? (
          <>
            {/* By Amount / By Shares input-mode toggle */}
            <div
              className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1"
              role="tablist"
              aria-label="Order input mode"
            >
              {[
                { key: 'amount', label: 'By Amount' },
                { key: 'shares', label: 'By Shares' },
              ].map((m) => {
                const on = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setMode(m.key)}
                    className={cx(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                      on
                        ? 'bg-white/[0.06] text-text shadow-[0_2px_10px_-4px_rgba(0,0,0,0.6)]'
                        : 'text-muted hover:text-text',
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {mode === 'amount' ? (
              <>
                <INRInput
                  value={amount}
                  onChange={setAmount}
                  min={minInvestment}
                  max={maxInvestment}
                  label="Investment Amount"
                  placeholder="Enter amount"
                />

                {/* Quick-amount chips */}
                <div className="flex flex-wrap gap-2">
                  {quickChips.map((c) => (
                    <AmountChip
                      key={`${c.label}-${c.value}`}
                      label={c.label}
                      value={c.value}
                      active={amount === c.value}
                      onClick={setAmount}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div>
                <label className={cx('mb-1.5 block', LABEL)} htmlFor="trade-qty">
                  Quantity (shares)
                </label>
                <div
                  className={cx(
                    GLASS_PANEL,
                    'flex items-center px-3.5 transition-all focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/40',
                  )}
                >
                  <input
                    id="trade-qty"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={Number.isFinite(qty) ? qty : ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setQty(Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1);
                    }}
                    className={cx(
                      'w-full bg-transparent py-2.5 text-sm font-semibold text-text placeholder:font-normal placeholder:text-muted/60 focus:outline-none',
                      NUM,
                    )}
                  />
                  <span className="ml-2 select-none text-xs font-medium text-muted">shares</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">Est. cost (incl. buffer)</span>
                  <span className={cx(NUM, 'text-sm font-bold text-text')}>
                    {formatINR(sharesNeedAmount)}
                  </span>
                </div>
                {sharesExceedMax && (
                  <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>
                      {qty} {qty === 1 ? 'share' : 'shares'} needs {formatINR(sharesNeedAmount)},
                      above your {formatINR(maxInvestment)} max — lower the quantity or raise the
                      limit in Settings.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Shares preview chip */}
            <div className={cx(GLASS_PANEL, 'flex items-center justify-between px-4 py-3')}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Layers size={14} className="text-accent/80" />
                Estimated Shares
              </span>
              <span className={cx(NUM, 'text-sm font-bold text-text')}>
                ≈ {estShares} {estShares === 1 ? 'share' : 'shares'}
              </span>
            </div>

            {amountValid && price > 0 && estShares < 1 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>
                  {formatINR(amount)} buys 0 shares — one {symbol} share costs {formatINR(price)}.
                  Enter at least {formatINR(Math.ceil(price))}
                  {Math.ceil(price) > maxInvestment
                    ? `, but that exceeds your ${formatINR(maxInvestment)} max — raise it in Settings first.`
                    : '.'}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className={cx(GLASS_PANEL, 'px-4 py-3.5 text-sm leading-relaxed text-muted')}>
            A SELL closes your entire open position for{' '}
            <span className="font-semibold text-text">{symbol || 'this stock'}</span>. No amount
            needed.
          </div>
        )}

        {/* Position context for the selected symbol */}
        <PositionContext position={position} price={price} />

        {/* Estimated cost / proceeds breakdown */}
        <OrderSummary
          action={action}
          price={price}
          estShares={estShares}
          amount={amount}
          cashBalance={cash}
          position={position}
        />

        {result && (
          <div
            className={cx(
              'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm',
              result.type === 'success'
                ? 'border-accent/30 bg-accent/10 text-accent shadow-[0_0_24px_rgba(0,200,83,0.12)]'
                : 'border-danger/30 bg-danger/10 text-danger shadow-[0_0_24px_rgba(255,82,82,0.12)]',
            )}
          >
            {result.type === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        )}

        {/* Follow-AI action (fix #2) */}
        <div>
          <button
            type="button"
            onClick={handleFollowAi}
            aria-disabled={!canFollowAi}
            aria-describedby={!canFollowAi && aiDisabledReason ? 'ai-reason' : undefined}
            className={cx(
              'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-2.5 text-sm font-semibold text-accent transition-all',
              'hover:border-accent/50 hover:bg-accent/[0.14] active:scale-[0.98]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-accent/[0.08] aria-disabled:active:scale-100',
            )}
          >
            <Sparkles size={16} />
            {sig
              ? `Follow AI · ${sig.signal} ${symbol} (${sig.confidence}%)`
              : 'Follow AI'}
          </button>
          {!canFollowAi && aiDisabledReason && (
            <p id="ai-reason" className="mt-1.5 text-xs text-muted">
              {aiDisabledReason}
            </p>
          )}
        </div>

        {/* Manual place button */}
        <div>
          <button
            type="button"
            onClick={handlePlace}
            aria-disabled={!canPlace}
            aria-describedby={
              !canPlace && !submitting && placeDisabledReason && !(!isBuy && !sellPlaceable)
                ? 'place-reason'
                : undefined
            }
            className={cx(
              'w-full',
              isBuy
                ? BTN_PRIMARY
                : 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-danger to-[#FF7B7B] px-4 py-2.5 text-sm font-semibold text-[#2A0B0B] shadow-[0_4px_20px_-4px_rgba(255,82,82,0.5)] transition-all hover:brightness-110 active:scale-[0.98]',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:brightness-100 aria-disabled:active:scale-100',
            )}
          >
            {submitting && <Spinner size="sm" />}
            {submitting
              ? 'Placing…'
              : !isBuy && !sellPlaceable
                ? `No position in ${symbol || 'this stock'}`
                : `${isLiveMode ? 'Place LIVE ' : 'Place '}${action}${symbol ? ` ${symbol}` : ''}`}
          </button>
          {/* Helper reason — hidden for SELL-without-position since the button label already says it. */}
          {!canPlace && !submitting && placeDisabledReason && !(!isBuy && !sellPlaceable) && (
            <p id="place-reason" className="mt-1.5 text-xs text-muted">
              {placeDisabledReason}
            </p>
          )}
        </div>
      </div>

      {/* REAL MONEY per-order confirmation (live mode only) */}
      <Modal
        open={confirmLiveOpen}
        title="Confirm REAL MONEY order"
        onClose={() => setConfirmLiveOpen(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              Place a <b>real {pendingAction}</b> for <b>{symbol}</b>
              {confirmIsBuy ? (
                <>
                  {' '}
                  (≈ {estShares} {estShares === 1 ? 'share' : 'shares'}, {formatINR(amount)})
                </>
              ) : (
                <> (entire holding)</>
              )}{' '}
              on your Groww account. This uses real funds and cannot be undone here.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => setConfirmLiveOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => doSubmit(pendingAction)}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-danger to-[#FF7A7A] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_-4px_rgba(255,82,82,0.6)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? <Spinner size="sm" /> : <Zap size={16} />}
              Place real {pendingAction}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

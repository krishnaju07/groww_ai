import { useEffect, useState } from 'react';
import { FlaskConical, Play, AlertTriangle, Calendar } from 'lucide-react';
import useStocksStore from '../store/useStocksStore';
import { runBacktest } from '../services/backtest.service';
import StockSelector from '../components/trading/StockSelector';
import Card from '../components/common/Card';
import StatTile from '../components/common/StatTile';
import Spinner from '../components/common/Spinner';
import Skeleton from '../components/common/Skeleton';
import RangeSlider from '../components/common/RangeSlider';
import INRInput from '../components/common/INRInput';
import EquityCurve from '../components/dashboard/EquityCurve';
import {
  formatINR,
  formatPercent,
  formatNumber,
  pnlColorClass,
} from '../lib/format';
import { cx, BTN_PRIMARY, GLASS_PANEL, GRADIENT_TEXT, LABEL, NUM, PILL } from '../lib/ui';

/**
 * @typedef {import('../types').BacktestParams} BacktestParams
 * @typedef {import('../types').BacktestResult} BacktestResult
 */

/**
 * Default ISO `YYYY-MM-DD` date string `n` days before today.
 * @param {number} days
 * @returns {string}
 */
function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// Styled date-input field (glass, accent focus ring).
const DATE_INPUT =
  'w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent/40 focus:ring-2 focus:ring-accent/40 [color-scheme:dark]';

/**
 * Backtest page (route `/backtest`). Configures and runs a single-symbol backtest,
 * then renders summary metric cards, the result equity curve, and a trade log.
 * @returns {JSX.Element}
 */
export default function Backtest() {
  const stocks = useStocksStore((s) => s.stocks);
  const fetchStocks = useStocksStore((s) => s.fetchStocks);

  const [form, setForm] = useState({
    symbol: 'RELIANCE',
    startDate: daysAgoISO(365),
    endDate: todayISO(),
    initialCapital: 1_000_000,
    perTradeAmount: 50_000,
    minConfidenceScore: 60,
    stopLossPercent: 2.5,
    takeProfitPercent: 5,
    trailingStopPercent: 1.5,
  });

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  /** @type {[BacktestResult | null, Function]} */
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  /**
   * @param {keyof BacktestParams} key
   * @param {string|number} value
   */
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const datesValid = form.startDate && form.endDate && form.startDate < form.endDate;
  const capitalValid = form.initialCapital > 0;
  const perTradeValid =
    form.perTradeAmount > 0 && form.perTradeAmount <= form.initialCapital;
  const canRun = Boolean(form.symbol) && datesValid && capitalValid && perTradeValid && !running;

  const handleRun = async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      /** @type {BacktestParams} */
      const params = {
        symbol: form.symbol,
        startDate: form.startDate,
        endDate: form.endDate,
        initialCapital: Number(form.initialCapital),
        perTradeAmount: Number(form.perTradeAmount),
        minConfidenceScore: Number(form.minConfidenceScore),
        stopLossPercent: Number(form.stopLossPercent),
        takeProfitPercent: Number(form.takeProfitPercent),
        trailingStopPercent: Number(form.trailingStopPercent),
      };
      const res = await runBacktest(params);
      setResult(res);
    } catch (err) {
      setError(err && err.message ? err.message : 'Backtest failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent shadow-glow">
          <FlaskConical size={20} />
        </span>
        <div>
          <h1 className={cx('font-display text-2xl font-bold tracking-tight', GRADIENT_TEXT)}>
            Backtest
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Replay the AI strategy over historical data for a single symbol.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <BacktestForm
            form={form}
            stocks={stocks}
            setField={setField}
            onSymbolChange={(symbol) => setField('symbol', symbol)}
            datesValid={datesValid}
            perTradeValid={perTradeValid}
            canRun={canRun}
            running={running}
            onRun={handleRun}
          />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger animate-fade-in">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {running && <BacktestSkeleton />}

          {!running && !result && !error && (
            <Card title="Results" subtitle="Run a backtest to see performance">
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted">
                  <FlaskConical size={22} />
                </span>
                <p className="text-sm text-muted">No backtest run yet.</p>
              </div>
            </Card>
          )}

          {!running && result && <BacktestResults result={result} />}
        </div>
      </div>
    </div>
  );
}

/**
 * BacktestForm — the configuration panel.
 * @param {Object} props
 * @param {Object} props.form
 * @param {import('../types').StockQuote[]} props.stocks
 * @param {(key:string, value:(string|number))=>void} props.setField
 * @param {(symbol:string)=>void} props.onSymbolChange
 * @param {boolean} props.datesValid
 * @param {boolean} props.perTradeValid
 * @param {boolean} props.canRun
 * @param {boolean} props.running
 * @param {()=>void} props.onRun
 * @returns {JSX.Element}
 */
function BacktestForm({
  form,
  stocks,
  setField,
  onSymbolChange,
  datesValid,
  perTradeValid,
  canRun,
  running,
  onRun,
}) {
  return (
    <Card title="Configuration" subtitle="Strategy & risk parameters">
      <div className="flex flex-col gap-5">
        <StockSelector stocks={stocks} value={form.symbol} onChange={onSymbolChange} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cx('mb-1.5 flex items-center gap-1.5', LABEL)}>
              <Calendar size={11} /> Start date
            </label>
            <input
              type="date"
              value={form.startDate}
              max={form.endDate}
              onChange={(e) => setField('startDate', e.target.value)}
              className={DATE_INPUT}
            />
          </div>
          <div>
            <label className={cx('mb-1.5 flex items-center gap-1.5', LABEL)}>
              <Calendar size={11} /> End date
            </label>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(e) => setField('endDate', e.target.value)}
              className={DATE_INPUT}
            />
          </div>
        </div>
        {!datesValid && (
          <p className="-mt-3 text-xs text-danger">Start date must be before end date.</p>
        )}

        <INRInput
          label="Initial capital"
          value={form.initialCapital}
          onChange={(v) => setField('initialCapital', v)}
          min={1}
          placeholder="1000000"
        />

        <div>
          <INRInput
            label="Per-trade amount"
            value={form.perTradeAmount}
            onChange={(v) => setField('perTradeAmount', v)}
            min={1}
            max={form.initialCapital}
            placeholder="50000"
          />
          {!perTradeValid && (
            <p className="mt-1 text-xs text-danger">
              Per-trade amount must be positive and not exceed initial capital.
            </p>
          )}
        </div>

        <div className={cx(GLASS_PANEL, 'flex flex-col gap-5 p-4')}>
          <span className={LABEL}>Strategy &amp; risk</span>
          <RangeSlider
            label="Min confidence"
            value={form.minConfidenceScore}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setField('minConfidenceScore', v)}
            format={(v) => `${Math.round(v)}%`}
          />
          <RangeSlider
            label="Stop loss"
            value={form.stopLossPercent}
            min={0.5}
            max={20}
            step={0.1}
            onChange={(v) => setField('stopLossPercent', v)}
            format={(v) => `${v.toFixed(1)}%`}
          />
          <RangeSlider
            label="Take profit"
            value={form.takeProfitPercent}
            min={0.5}
            max={50}
            step={0.1}
            onChange={(v) => setField('takeProfitPercent', v)}
            format={(v) => `${v.toFixed(1)}%`}
          />
          <RangeSlider
            label="Trailing stop (0 = disabled)"
            value={form.trailingStopPercent}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => setField('trailingStopPercent', v)}
            format={(v) => (v <= 0 ? 'Off' : `${v.toFixed(1)}%`)}
          />
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className={cx(BTN_PRIMARY, 'w-full')}
        >
          {running ? <Spinner size="sm" /> : <Play size={16} />}
          {running ? 'Running…' : 'Run backtest'}
        </button>
      </div>
    </Card>
  );
}

/**
 * BacktestSkeleton — shimmer placeholders shown while a backtest runs.
 * @returns {JSX.Element}
 */
function BacktestSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" rounded="rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" rounded="rounded-2xl" />
      <Skeleton className="h-64 w-full" rounded="rounded-2xl" />
    </div>
  );
}

/**
 * BacktestResults — metric cards, equity curve, and trade log for a result.
 * @param {Object} props
 * @param {BacktestResult} props.result
 * @returns {JSX.Element}
 */
function BacktestResults({ result }) {
  const trades = Array.isArray(result.trades) ? result.trades : [];
  const equityCurve = Array.isArray(result.equityCurve) ? result.equityCurve : [];

  const returnPositive = (result.totalReturnPercent || 0) >= 0;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Total Return"
          value={formatPercent(result.totalReturnPercent)}
          delta={formatINR(result.finalCapital)}
          deltaPositive={returnPositive}
        />
        <StatTile
          label="Max Drawdown"
          value={formatPercent(-Math.abs(result.maxDrawdownPercent || 0))}
          deltaPositive={false}
        />
        <StatTile label="Win Rate" value={`${formatNumber(result.winRate)}%`} />
        <StatTile label="Sharpe Ratio" value={formatNumber(result.sharpeRatio)} />
        <StatTile label="Trades" value={formatNumber(result.totalTrades)} />
      </div>

      <Card title="Equity Curve" subtitle={`${result.params?.symbol || ''} backtest`}>
        <EquityCurve data={equityCurve} />
      </Card>

      <Card title="Trade Log" subtitle={`${trades.length} executions`}>
        <TradeLog trades={trades} />
      </Card>
    </div>
  );
}

/**
 * TradeLog — table of individual backtest trades.
 * @param {Object} props
 * @param {import('../types').BacktestTrade[]} props.trades
 * @returns {JSX.Element}
 */
function TradeLog({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted">
        No trades were generated for these parameters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className={cx('px-3 py-2.5', LABEL)}>Date</th>
            <th className={cx('px-3 py-2.5', LABEL)}>Action</th>
            <th className={cx('px-3 py-2.5 text-right', LABEL)}>Price</th>
            <th className={cx('px-3 py-2.5 text-right', LABEL)}>Qty</th>
            <th className={cx('px-3 py-2.5 text-right', LABEL)}>P&amp;L</th>
            <th className={cx('px-3 py-2.5', LABEL)}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const hasPnl = Number.isFinite(t.pnl);
            return (
              <tr
                key={`${t.date}-${t.action}-${i}`}
                className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <td className={cx('whitespace-nowrap px-3 py-2.5 text-muted', NUM)}>{t.date}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cx(
                      PILL,
                      t.action === 'BUY'
                        ? 'border border-accent/25 bg-accent/12 text-accent'
                        : 'border border-danger/25 bg-danger/12 text-danger'
                    )}
                  >
                    {t.action}
                  </span>
                </td>
                <td className={cx('px-3 py-2.5 text-right text-text', NUM)}>{formatINR(t.price)}</td>
                <td className={cx('px-3 py-2.5 text-right text-text', NUM)}>{formatNumber(t.quantity)}</td>
                <td className={cx('px-3 py-2.5 text-right font-semibold', NUM, hasPnl ? pnlColorClass(t.pnl) : 'text-muted')}>
                  {hasPnl
                    ? `${formatINR(t.pnl)}${
                        Number.isFinite(t.pnlPercent) ? ` (${formatPercent(t.pnlPercent)})` : ''
                      }`
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-muted">{t.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

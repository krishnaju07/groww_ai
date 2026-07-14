import { useEffect, useState } from 'react';
import { Card } from '../components/common/Card.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { StatTile } from '../components/common/StatTile.jsx';
import { INRInput } from '../components/common/INRInput.jsx';
import { EquityCurve } from '../components/dashboard/EquityCurve.jsx';
import { BTN_PRIMARY, INPUT } from '../lib/ui.js';
import { formatINR, formatPercent, formatDateTime } from '../lib/format.js';
import { stocksService } from '../services/stocks.service.js';
import { backtestService } from '../services/backtest.service.js';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { toast } from '../store/useToastStore.js';

/** yyyy-mm-dd, n days before today */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** yyyy-mm-dd local date string → an absolute instant at IST 00:00:00 / 23:59:59 for that calendar day */
function istBoundary(dateStr, endOfDay) {
  return new Date(`${dateStr}T${endOfDay ? '23:59:59' : '00:00:00'}+05:30`);
}

export function Backtest() {
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetch);

  const [stocks, setStocks] = useState([]);
  const [symbol, setSymbol] = useState('RELIANCE');
  const [interval, setInterval_] = useState('5m');
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(daysAgo(0));
  const [form, setForm] = useState({
    startingCapital: 100000,
    amountPerTrade: 5000,
    minConfidence: 75,
    stopLossPercent: 2,
    targetPercent: 4,
    trailingEnabled: false,
    trailingPercent: 1.5,
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    stocksService.list().then(setStocks).catch(() => {});
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings) return;
    setForm((f) => ({
      ...f,
      amountPerTrade: settings.autoInvest?.amountPerTrade ?? f.amountPerTrade,
      minConfidence: settings.autoInvest?.minConfidence ?? f.minConfidence,
      stopLossPercent: settings.autoExit?.stopLossPercent ?? f.stopLossPercent,
      targetPercent: settings.autoExit?.targetPercent ?? f.targetPercent,
      trailingEnabled: settings.autoExit?.trailingEnabled ?? f.trailingEnabled,
      trailingPercent: settings.autoExit?.trailingPercent ?? f.trailingPercent,
    }));
  }, [settings]);

  async function runBacktest() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const data = await backtestService.run({
        symbol,
        interval,
        from: istBoundary(fromDate, false),
        to: istBoundary(toDate, true),
        ...form,
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  const equityCurve = result?.equityCurve?.map((p) => ({ time: p.time, equity: p.equity })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Backtest</h1>
        <p className="text-sm text-muted">
          Replay the same deterministic quant scorer used for live auto-trading over real historical candles from Groww —
          no LLM calls, no simulated data.
        </p>
      </div>

      <Card>
        <div className="mb-4 font-display font-semibold">Strategy Parameters</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Symbol</label>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={INPUT}>
              {stocks.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Interval</label>
            <select value={interval} onChange={(e) => setInterval_(e.target.value)} className={INPUT}>
              <option value="5m">5 minute</option>
              <option value="15m">15 minute</option>
              <option value="30m">30 minute</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">From</label>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={daysAgo(0)}
              onChange={(e) => setToDate(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Starting capital</label>
            <INRInput
              value={form.startingCapital}
              onChange={(v) => setForm((f) => ({ ...f, startingCapital: v }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Amount per trade</label>
            <INRInput
              value={form.amountPerTrade}
              onChange={(v) => setForm((f) => ({ ...f, amountPerTrade: v }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Min confidence (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.minConfidence}
              onChange={(e) => setForm((f) => ({ ...f, minConfidence: Number(e.target.value) }))}
              className={INPUT}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Stop-loss cap (%)</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={form.stopLossPercent}
              onChange={(e) => setForm((f) => ({ ...f, stopLossPercent: Number(e.target.value) }))}
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-muted">The AI sizes its own stop off real volatility (ATR) — this just bounds it.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Target cap (%)</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={form.targetPercent}
              onChange={(e) => setForm((f) => ({ ...f, targetPercent: Number(e.target.value) }))}
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-muted">Same idea — caps the ATR-based target, doesn't replace it.</p>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.trailingEnabled}
                onChange={(e) => setForm((f) => ({ ...f, trailingEnabled: e.target.checked }))}
                className="h-4 w-4 rounded accent-accent"
              />
              Trailing stop
            </label>
            {form.trailingEnabled && (
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.trailingPercent}
                onChange={(e) => setForm((f) => ({ ...f, trailingPercent: Number(e.target.value) }))}
                className={`${INPUT} w-24`}
              />
            )}
          </div>
        </div>

        <button onClick={runBacktest} disabled={running} className={`mt-5 ${BTN_PRIMARY}`}>
          {running ? 'Running…' : 'Run Backtest'}
        </button>

        {error && (
          <p className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Total Trades" value={result.totalTrades} format={(n) => String(n)} />
            <StatTile
              label="Win Rate"
              value={result.winRate}
              format={(n) => `${n}%`}
              sub={`${result.winCount}W / ${result.lossCount}L`}
              tone={result.winRate >= 50 ? 'accent' : 'danger'}
            />
            <StatTile
              label="Total P&L"
              value={result.totalPnl}
              format={formatINR}
              sub={formatPercent(result.totalPnlPercent)}
              tone={result.totalPnl >= 0 ? 'accent' : 'danger'}
            />
            <StatTile
              label="Max Drawdown"
              value={result.maxDrawdownPercent}
              format={(n) => `${n}%`}
              tone={result.maxDrawdownPercent > 10 ? 'danger' : 'default'}
            />
          </div>

          <div className="h-72">
            <EquityCurve data={equityCurve} />
          </div>

          <Card>
            <div className="mb-3 font-display font-semibold">Trades ({result.trades.length})</div>
            {result.trades.length === 0 ? (
              <p className="text-sm text-muted">No trades were triggered in this window — try a wider date range or lower the min-confidence threshold.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-4">Entry</th>
                      <th className="py-2 pr-4">Exit</th>
                      <th className="py-2 pr-4">Qty</th>
                      <th className="py-2 pr-4">Entry ₹</th>
                      <th className="py-2 pr-4">Exit ₹</th>
                      <th className="py-2 pr-4">P&L</th>
                      <th className="py-2 pr-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {result.trades.map((t, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 text-muted">{formatDateTime(t.entryTime)}</td>
                        <td className="py-2 pr-4 text-muted">{formatDateTime(t.time)}</td>
                        <td className="py-2 pr-4">{t.quantity}</td>
                        <td className="py-2 pr-4">{formatINR(t.entryPrice)}</td>
                        <td className="py-2 pr-4">{formatINR(t.price)}</td>
                        <td className={`py-2 pr-4 font-semibold ${t.pnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                          {formatINR(t.pnl)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge tone={t.pnl >= 0 ? 'accent' : 'danger'}>{t.exitReason}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

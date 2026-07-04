import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { Card } from '../components/common/Card.jsx';
import { INRInput } from '../components/common/INRInput.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { LiveAutoTradingConfirmModal } from '../components/common/LiveAutoTradingConfirmModal.jsx';
import { BTN_PRIMARY, INPUT } from '../lib/ui.js';
import { toast } from '../store/useToastStore.js';

const MARKET_DATA_PROVIDERS = [
  { key: 'yahoo', label: 'Yahoo Finance' },
  { key: 'groww', label: 'Groww' },
  { key: 'alphavantage', label: 'Alpha Vantage' },
  { key: 'mock', label: 'Mock (offline)' },
];

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const fetch = useSettingsStore((s) => s.fetch);
  const update = useSettingsStore((s) => s.update);
  const [form, setForm] = useState(null);
  const [showLiveAutoConfirm, setShowLiveAutoConfirm] = useState(false);

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!form) return null;

  async function save() {
    try {
      await update({ minInvestment: form.minInvestment, maxInvestment: form.maxInvestment });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function updateSystemConfig(patch, successMessage) {
    try {
      await update({ systemConfig: patch });
      toast.success(successMessage);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleLiveAutoTradingToggle(enable) {
    if (enable) {
      setShowLiveAutoConfirm(true);
      return;
    }
    await updateSystemConfig({ enableLiveAutoTrading: false }, 'Unattended live auto-trading turned off');
  }

  async function confirmLiveAutoTrading(typedPhrase) {
    try {
      await update({ systemConfig: { enableLiveAutoTrading: true, confirmPhrase: typedPhrase } });
      toast.success('Unattended live auto-trading turned ON');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setShowLiveAutoConfirm(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">Investment limits and the current trading-mode safety gate status.</p>
      </div>

      <Card>
        <div className="mb-4 font-display font-semibold">Trading Mode</div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Current mode</span>
          <Badge tone={tradingMode?.mode === 'live' ? 'danger' : 'accent'}>{tradingMode?.mode?.toUpperCase() ?? 'PAPER'}</Badge>
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted">
          <div>Live trading enabled on server: {tradingMode?.liveEnabledEnv ? 'Yes' : 'No'}</div>
          <div>Broker credential configured: {tradingMode?.hasCredential ? 'Yes' : 'No'}</div>
          <div>Kill switch engaged: {tradingMode?.killSwitchEngaged ? 'Yes' : 'No'}</div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Real-broker connections and the live/paper switch are configured from the <Link to="/brokers" className="text-accent underline">Brokers page</Link>.
        </p>
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">System Controls</div>
        <p className="mb-3 text-xs text-muted">
          These used to require editing the server's <span className="font-mono">.env</span> file and a restart. They're
          now live-editable here — changes apply within a few seconds, no restart needed.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
            <div>
              <div className="text-sm font-medium">Live trading (master switch)</div>
              <p className="text-xs text-muted">Required before any real-money order — manual or automatic — can go through.</p>
            </div>
            <button
              onClick={() =>
                updateSystemConfig(
                  { enableLiveTrading: !form.systemConfig?.enableLiveTrading },
                  `Live trading turned ${!form.systemConfig?.enableLiveTrading ? 'ON' : 'off'}`,
                )
              }
              className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                form.systemConfig?.enableLiveTrading
                  ? 'border-danger/50 bg-danger/10 text-danger'
                  : 'border-border/70 text-muted hover:border-border'
              }`}
            >
              {form.systemConfig?.enableLiveTrading ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
            <div>
              <div className="text-sm font-medium">Unattended live auto-trading</div>
              <p className="text-xs text-muted">
                Lets the 30s auto-trading engine fire real-money orders with zero per-order confirmation. Turning this ON
                requires typing a confirmation phrase.
              </p>
            </div>
            <button
              onClick={() => handleLiveAutoTradingToggle(!form.systemConfig?.enableLiveAutoTrading)}
              className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                form.systemConfig?.enableLiveAutoTrading
                  ? 'border-danger/50 bg-danger/10 text-danger'
                  : 'border-border/70 text-muted hover:border-border'
              }`}
            >
              {form.systemConfig?.enableLiveAutoTrading ? 'ON' : 'OFF'}
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Max value per live order</label>
            <INRInput
              value={form.systemConfig?.liveMaxOrderValue ?? 5000}
              onChange={(v) => setForm((f) => ({ ...f, systemConfig: { ...f.systemConfig, liveMaxOrderValue: v } }))}
              onBlur={() => updateSystemConfig({ liveMaxOrderValue: form.systemConfig.liveMaxOrderValue }, 'Live order value cap updated')}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
            <div>
              <div className="text-sm font-medium">Auto-trading engine</div>
              <p className="text-xs text-muted">Master on/off for the whole 30s auto-trading cron (paper and live alike).</p>
            </div>
            <button
              onClick={() =>
                updateSystemConfig(
                  { autoTradingEnabled: !form.systemConfig?.autoTradingEnabled },
                  `Auto-trading engine turned ${!form.systemConfig?.autoTradingEnabled ? 'on' : 'off'}`,
                )
              }
              className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                form.systemConfig?.autoTradingEnabled
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/70 text-muted hover:border-border'
              }`}
            >
              {form.systemConfig?.autoTradingEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Market data provider</label>
            <div className="grid grid-cols-2 gap-2">
              {MARKET_DATA_PROVIDERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => updateSystemConfig({ marketDataProvider: key }, `Market data provider set to ${label}`)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition-colors ${
                    form.systemConfig?.marketDataProvider === key
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border/70 text-muted hover:border-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Background AI scan interval (minutes)</label>
            <input
              type="number"
              min={1}
              className={INPUT}
              value={form.systemConfig?.aiScanIntervalMinutes ?? 5}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  systemConfig: { ...f.systemConfig, aiScanIntervalMinutes: Math.max(1, parseInt(e.target.value, 10) || 1) },
                }))
              }
              onBlur={() =>
                updateSystemConfig(
                  { aiScanIntervalMinutes: form.systemConfig.aiScanIntervalMinutes },
                  `AI scan interval set to ${form.systemConfig.aiScanIntervalMinutes}m`,
                )
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
            <div>
              <div className="text-sm font-medium">Ignore market hours</div>
              <p className="text-xs text-muted">Dev/testing only — lets everything run outside NSE's 9:15-3:30 IST window.</p>
            </div>
            <button
              onClick={() =>
                updateSystemConfig(
                  { ignoreMarketHours: !form.systemConfig?.ignoreMarketHours },
                  `Ignore market hours turned ${!form.systemConfig?.ignoreMarketHours ? 'on' : 'off'}`,
                )
              }
              className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                form.systemConfig?.ignoreMarketHours
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/70 text-muted hover:border-border'
              }`}
            >
              {form.systemConfig?.ignoreMarketHours ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {showLiveAutoConfirm && (
          <LiveAutoTradingConfirmModal onConfirm={confirmLiveAutoTrading} onCancel={() => setShowLiveAutoConfirm(false)} />
        )}
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">AI Provider</div>
        <p className="mb-3 text-xs text-muted">
          Which LLM the AI decision engine calls for BUY/SELL/WAIT calls. Switches immediately, no restart needed. If the
          selected provider has no API key configured on the server, decisions silently fall back to the quant-only scorer.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'openai', label: 'OpenAI (GPT)' },
            { key: 'claude', label: 'Claude' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={async () => {
                try {
                  await update({ aiProvider: key });
                  toast.success(`AI provider set to ${label}`);
                } catch (err) {
                  toast.error(err.message);
                }
              }}
              className={`rounded-xl border py-2.5 font-semibold transition-colors ${
                form.aiProvider === key ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">Auto-Trading AI Confirmation</div>
        <p className="mb-3 text-xs text-muted">
          When on, the 30s auto-trading screen still runs the quant scorer on every symbol, but a BUY/SELL only actually
          fires if the AI provider above also agrees on direction — an extra confirmation layer on top of the risk
          manager and kill switch, which apply either way. Background AI scan (all symbols, informational, powers AI Top
          Picks / watchlist badges / Portfolio AI View) runs every {form.systemConfig?.aiScanIntervalMinutes ?? 5} minutes
          regardless of this setting.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: true, label: 'On (Recommended)' },
            { key: false, label: 'Off — quant only' },
          ].map(({ key, label }) => (
            <button
              key={String(key)}
              onClick={async () => {
                try {
                  await update({ autoInvest: { requireAiConfirmation: key } });
                  toast.success(`AI confirmation for auto-trading turned ${key ? 'on' : 'off'}`);
                } catch (err) {
                  toast.error(err.message);
                }
              }}
              className={`rounded-xl border py-2.5 font-semibold transition-colors ${
                form.autoInvest?.requireAiConfirmation === key
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/70 text-muted hover:border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted">
            Minimum confidence to auto-fire a trade unattended (0-100)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.autoInvest?.minConfidence ?? 75}
            onChange={(e) => setForm((f) => ({ ...f, autoInvest: { ...f.autoInvest, minConfidence: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) } }))}
            onBlur={async () => {
              try {
                await update({ autoInvest: { minConfidence: form.autoInvest.minConfidence } });
                toast.success(`Auto-trading confidence threshold set to ${form.autoInvest.minConfidence}%`);
              } catch (err) {
                toast.error(err.message);
              }
            }}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-muted">
            Higher = fewer, safer trades (only the clearest multi-timeframe setups). Lower = more trades, more noise.
          </p>
        </div>
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">Investment Limits</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Minimum per trade</label>
            <INRInput value={form.minInvestment} onChange={(v) => setForm((f) => ({ ...f, minInvestment: v }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Maximum per trade</label>
            <INRInput value={form.maxInvestment} onChange={(v) => setForm((f) => ({ ...f, maxInvestment: v }))} />
          </div>
        </div>
        <button onClick={save} className={`${BTN_PRIMARY} mt-4`}>
          Save Settings
        </button>
      </Card>
    </div>
  );
}

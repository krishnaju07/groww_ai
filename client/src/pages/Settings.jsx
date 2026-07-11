import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { Card } from '../components/common/Card.jsx';
import { INRInput } from '../components/common/INRInput.jsx';
import { BTN_PRIMARY, INPUT } from '../lib/ui.js';
import { toast } from '../store/useToastStore.js';
import { settingsService } from '../services/settings.service.js';

const MARKET_DATA_PROVIDERS = [
  { key: 'yahoo', label: 'Yahoo Finance' },
  { key: 'groww', label: 'Groww' },
  { key: 'mock', label: 'Mock (offline)' },
];

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const fetch = useSettingsStore((s) => s.fetch);
  const update = useSettingsStore((s) => s.update);
  const [form, setForm] = useState(null);
  const [modelOptions, setModelOptions] = useState({});

  useEffect(() => {
    fetch();
    settingsService.aiModelOptions().then(setModelOptions);
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">AI behavior, investment limits, and operational tuning.</p>
      </div>

      <Card>
        <div className="mb-4 font-display font-semibold">Market Data &amp; Scanning</div>
        <div className="space-y-4">
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
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">News</div>
        <p className="mb-3 text-xs text-muted">
          Headlines fed into the AI's context (Google News, no API key needed) — a tighter recency window means "very
          latest" news only, at the risk of some symbols having no qualifying headlines on a slow news day.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Max headline age (hours)</label>
            <input
              type="number"
              min={1}
              className={INPUT}
              value={form.systemConfig?.newsMaxAgeHours ?? 24}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  systemConfig: { ...f.systemConfig, newsMaxAgeHours: Math.max(1, parseInt(e.target.value, 10) || 1) },
                }))
              }
              onBlur={() =>
                updateSystemConfig(
                  { newsMaxAgeHours: form.systemConfig.newsMaxAgeHours },
                  `News recency window set to ${form.systemConfig.newsMaxAgeHours}h`,
                )
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Stock-specific headlines</label>
            <input
              type="number"
              min={1}
              max={10}
              className={INPUT}
              value={form.systemConfig?.newsHeadlineCount ?? 3}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  systemConfig: { ...f.systemConfig, newsHeadlineCount: Math.max(1, parseInt(e.target.value, 10) || 1) },
                }))
              }
              onBlur={() =>
                updateSystemConfig(
                  { newsHeadlineCount: form.systemConfig.newsHeadlineCount },
                  `Headline count set to ${form.systemConfig.newsHeadlineCount}`,
                )
              }
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">Auto-Trading Timing</div>
        <p className="mb-3 text-xs text-muted">
          When the unattended auto-trader is allowed to open <span className="font-medium">new</span> positions. These
          only gate fresh entries — exits and your own manual orders are never blocked.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Avoid first N minutes after open</label>
            <input
              type="number"
              min={0}
              className={INPUT}
              value={form.systemConfig?.avoidFirstMinutes ?? 15}
              onChange={(e) =>
                setForm((f) => ({ ...f, systemConfig: { ...f.systemConfig, avoidFirstMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) } }))
              }
              onBlur={() =>
                updateSystemConfig({ avoidFirstMinutes: form.systemConfig.avoidFirstMinutes }, `Avoiding first ${form.systemConfig.avoidFirstMinutes} min after open`)
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Stop new trades after (HH:MM IST)</label>
            <input
              type="text"
              placeholder="14:45"
              className={INPUT}
              value={form.systemConfig?.stopNewTradesAfter ?? '14:45'}
              onChange={(e) => setForm((f) => ({ ...f, systemConfig: { ...f.systemConfig, stopNewTradesAfter: e.target.value } }))}
              onBlur={() =>
                /^\d{1,2}:\d{2}$/.test(form.systemConfig.stopNewTradesAfter)
                  ? updateSystemConfig({ stopNewTradesAfter: form.systemConfig.stopNewTradesAfter }, `New-entry cutoff set to ${form.systemConfig.stopNewTradesAfter}`)
                  : toast.error('Time must be HH:MM')
              }
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted">Min options opportunity score (0-100)</label>
          <input
            type="number"
            min={0}
            max={100}
            className={INPUT}
            value={form.systemConfig?.opportunityScoreThreshold ?? 55}
            onChange={(e) =>
              setForm((f) => ({ ...f, systemConfig: { ...f.systemConfig, opportunityScoreThreshold: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) } }))
            }
            onBlur={() =>
              updateSystemConfig({ opportunityScoreThreshold: form.systemConfig.opportunityScoreThreshold }, `Opportunity threshold set to ${form.systemConfig.opportunityScoreThreshold}`)
            }
          />
          <p className="mt-1 text-xs text-muted">
            An options setup must score at least this (regime + greeks + direction + liquidity) before the auto-trader spends an
            LLM call on it. Higher = fewer, higher-quality trades and lower API cost.
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { key: 'skipLunchHour', label: 'Skip lunch hour (12:00–13:00)', desc: 'Low-liquidity midday window' },
            { key: 'avoidExpiryDay', label: 'Avoid expiry day (options)', desc: "Skip fresh option entries on the underlying's weekly expiry" },
            { key: 'regimeFilterEnabled', label: 'Market-regime filter', desc: 'Only enter when the NIFTY regime is a clean trend — sit out choppy/high-volatility markets' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
              <div>
                <div className="text-sm font-medium">{label}</div>
                <p className="text-xs text-muted">{desc}</p>
              </div>
              <button
                onClick={() => updateSystemConfig({ [key]: !form.systemConfig?.[key] }, `${label} turned ${!form.systemConfig?.[key] ? 'on' : 'off'}`)}
                className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                  form.systemConfig?.[key] ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
                }`}
              >
                {form.systemConfig?.[key] ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-4 font-display font-semibold">AI Provider</div>
        <p className="mb-3 text-xs text-muted">
          Which LLM the AI decision engine calls for BUY/SELL/WAIT calls. Switches immediately, no restart needed. If the
          selected provider has no API key configured on the server, decisions silently fall back to the quant-only scorer.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { key: 'openai', label: 'OpenAI (GPT)' },
            { key: 'claude', label: 'Claude' },
            { key: 'gemini', label: 'Gemini' },
            { key: 'grok', label: 'Grok' },
            { key: 'perplexity', label: 'Perplexity' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={async () => {
                try {
                  // Reset the model choice on provider switch — a model id picked for
                  // the old provider (e.g. 'sonar') is meaningless/invalid for a
                  // different one, so leftover it would otherwise silently break calls.
                  await update({ aiProvider: key, aiModel: '' });
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

        {modelOptions[form.aiProvider]?.length > 0 && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">
              Model — cheaper models cost less per call, at some quality tradeoff
            </label>
            <select
              value={form.aiModel || ''}
              onChange={async (e) => {
                const value = e.target.value;
                try {
                  await update({ aiModel: value });
                  toast.success(value ? `Model set to ${value}` : 'Using provider default model');
                } catch (err) {
                  toast.error(err.message);
                }
              }}
              className={INPUT}
            >
              <option value="">Auto (provider default)</option>
              {modelOptions[form.aiProvider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
          <div>
            <div className="text-sm font-medium">Multi-AI consensus</div>
            <p className="text-xs text-muted">
              Instead of one provider, poll <span className="font-medium">every</span> configured LLM and require several to
              agree with the quant scorer before auto-trading. Higher conviction, higher API cost.
            </p>
          </div>
          <button
            onClick={() => updateSystemConfig({ consensusEnabled: !form.systemConfig?.consensusEnabled }, `Multi-AI consensus turned ${!form.systemConfig?.consensusEnabled ? 'on' : 'off'}`)}
            className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
              form.systemConfig?.consensusEnabled ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
            }`}
          >
            {form.systemConfig?.consensusEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {form.systemConfig?.consensusEnabled && (
          <div className="mt-2">
            <label className="mb-1 block text-xs font-medium text-muted">Min LLMs that must agree</label>
            <input
              type="number"
              min={1}
              max={5}
              className={INPUT}
              value={form.systemConfig?.consensusMinAgree ?? 2}
              onChange={(e) => setForm((f) => ({ ...f, systemConfig: { ...f.systemConfig, consensusMinAgree: Math.max(1, parseInt(e.target.value, 10) || 1) } }))}
              onBlur={() => updateSystemConfig({ consensusMinAgree: form.systemConfig.consensusMinAgree }, `Consensus needs ${form.systemConfig.consensusMinAgree} agreeing`)}
            />
            <p className="mt-1 text-xs text-muted">Capped to however many providers actually have API keys configured.</p>
          </div>
        )}
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
        <div className="mb-4 font-display font-semibold">Auto-Exit / Position Management</div>
        <p className="mb-3 text-xs text-muted">
          How open positions are protected and booked automatically (checked every 15s). These apply to every open
          position — you never need to watch a chart.
        </p>
        {(() => {
          const ae = form.autoExit ?? {};
          const setAe = (patch, msg) => update({ autoExit: patch }).then(() => toast.success(msg)).catch((e) => toast.error(e.message));
          const numField = (label, key, def, desc, step = 'any') => (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
              <input
                type="number"
                min={0}
                step={step}
                className={INPUT}
                value={ae[key] ?? def}
                onChange={(e) => setForm((f) => ({ ...f, autoExit: { ...f.autoExit, [key]: Math.max(0, parseFloat(e.target.value) || 0) } }))}
                onBlur={() => setAe({ [key]: ae[key] }, `${label} saved`)}
              />
              {desc && <p className="mt-1 text-xs text-muted">{desc}</p>}
            </div>
          );
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
                <div>
                  <div className="text-sm font-medium">Auto-exit enabled</div>
                  <p className="text-xs text-muted">Master switch for the Position Guardian's stop/target/trailing/booking.</p>
                </div>
                <button
                  onClick={() => setAe({ enabled: !ae.enabled }, `Auto-exit turned ${!ae.enabled ? 'on' : 'off'}`)}
                  className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${ae.enabled ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'}`}
                >
                  {ae.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {numField('Stop-loss %', 'stopLossPercent', 2, 'Fallback when a position has no explicit stop')}
                {numField('Target %', 'targetPercent', 4, 'Fallback when a position has no explicit target')}
                {numField('Move stop to breakeven at % (0=off)', 'moveSlToCostAtPercent', 1.5, "Once up this much, a winner can't turn into a loser")}
                {numField('Max hold minutes (0=off)', 'maxHoldMinutes', 0, 'Time-exit a position going nowhere')}
                {numField('Partial-book at % (0=off)', 'partialBookAtPercent', 0, 'Book part of the position at this profit, let the rest run')}
                {numField('Partial-book fraction (0-1)', 'partialBookFraction', 0.5, 'How much of the position to book', '0.1')}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
                <div>
                  <div className="text-sm font-medium">Trailing stop</div>
                  <p className="text-xs text-muted">Ratchet the stop up as price makes new highs (locks in gains).</p>
                </div>
                <button
                  onClick={() => setAe({ trailingEnabled: !ae.trailingEnabled }, `Trailing stop turned ${!ae.trailingEnabled ? 'on' : 'off'}`)}
                  className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${ae.trailingEnabled ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'}`}
                >
                  {ae.trailingEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {ae.trailingEnabled && <div className="grid grid-cols-2 gap-4">{numField('Trailing %', 'trailingPercent', 1.5, 'Distance the stop trails below the high')}</div>}
            </div>
          );
        })()}
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

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

const TABS = [
  { key: 'trading', label: 'Trading' },
  { key: 'ai', label: 'AI & Learning' },
  { key: 'risk', label: 'Risk & Exits' },
  { key: 'data', label: 'Data Sources' },
];

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const fetch = useSettingsStore((s) => s.fetch);
  const update = useSettingsStore((s) => s.update);
  const [form, setForm] = useState(null);
  const [modelOptions, setModelOptions] = useState({});
  // Tab lives in the URL (?tab=...), not local state — otherwise a page refresh (or a
  // shared/bookmarked link) always lands back on the first tab instead of wherever the
  // user actually was.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.key === requestedTab) ? requestedTab : 'trading';
  const setTab = (key) => setSearchParams({ tab: key });

  useEffect(() => {
    fetch();
    settingsService.aiModelOptions().then(setModelOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!form) return null;

  async function saveAutoInvestSizing() {
    try {
      await update({ autoInvest: { amountPerTrade: form.autoInvest.amountPerTrade, maxOpenPositions: form.autoInvest.maxOpenPositions } });
      toast.success('Auto-invest sizing saved');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleAutoInvestEnabled() {
    try {
      await update({ autoInvest: { enabled: !form.autoInvest?.enabled } });
      toast.success(`Auto-invest turned ${!form.autoInvest?.enabled ? 'on' : 'off'}`);
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">Auto-trading behavior, AI provider, position management, and data sources.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border/70 bg-surface/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trading' && (
        <div className="space-y-6">
          <Card>
            <div className="mb-1 font-display font-semibold">Auto-Trading Master Switch</div>
            <p className="mb-3 text-xs text-muted">
              Two switches gate the unattended 30s auto-trading tick — <span className="font-medium">both</span> must be
              on for it to actually place a trade. This is the core engine switch; the other ("Auto-trading engine")
              lives on the <Link to="/live-trading" className="text-accent underline">Live Trading page</Link> next to
              the paper/live toggle.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
              <div>
                <div className="text-sm font-medium">Auto-invest enabled</div>
                <p className="text-xs text-muted">Off by default on a fresh account — turn this on to let the AI actually place unattended trades.</p>
              </div>
              <button
                onClick={toggleAutoInvestEnabled}
                className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                  form.autoInvest?.enabled ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
                }`}
              >
                {form.autoInvest?.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Amount per trade</label>
                <INRInput
                  value={form.autoInvest?.amountPerTrade ?? 5000}
                  onChange={(v) => setForm((f) => ({ ...f, autoInvest: { ...f.autoInvest, amountPerTrade: v } }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Max open positions</label>
                <input
                  type="number"
                  min={1}
                  className={INPUT}
                  value={form.autoInvest?.maxOpenPositions ?? 3}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, autoInvest: { ...f.autoInvest, maxOpenPositions: Math.max(1, parseInt(e.target.value, 10) || 1) } }))
                  }
                />
              </div>
            </div>
            <button onClick={saveAutoInvestSizing} className={`${BTN_PRIMARY} mt-3`}>
              Save sizing
            </button>
          </Card>

          <Card>
            <div className="mb-4 font-display font-semibold">Auto-Trading Focus</div>
            <p className="mb-3 text-xs text-muted">
              Which market the unattended 30s auto-trading tick actually acts on. The watchlist/underlying picks on the
              Trade page still work for manual trading and AI Top Picks either way — this only controls what gets traded
              automatically.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'OPTIONS', label: 'Options only', desc: 'Nifty 50 (Recommended)' },
                { key: 'EQUITY', label: 'Equity only', desc: 'Your stock watchlist' },
                { key: 'BOTH', label: 'Both', desc: 'Equity + options' },
              ].map(({ key, label, desc }) => (
                <button
                  key={key}
                  onClick={() => updateSystemConfig({ autoTradingFocus: key }, `Auto-trading focus set to ${label}`)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    (form.systemConfig?.autoTradingFocus ?? 'OPTIONS') === key
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border/70 text-muted hover:border-border'
                  }`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-[11px] opacity-80">{desc}</div>
                </button>
              ))}
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
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-6">
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
            <div className="mb-4 font-display font-semibold">Learning Gate</div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
              <div>
                <div className="text-sm font-medium">Veto setups the AI has proven it loses on</div>
                <p className="text-xs text-muted">
                  Before a fresh entry, checks the AI's own closed-trade history for this market regime / option side / hour.
                  If a condition has a losing record over enough trades, the trade is skipped. Inert on a fresh account —
                  it only activates once real losing patterns exist.
                </p>
              </div>
              <button
                onClick={() => updateSystemConfig({ learningGateEnabled: !form.systemConfig?.learningGateEnabled }, `Learning gate turned ${!form.systemConfig?.learningGateEnabled ? 'on' : 'off'}`)}
                className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                  form.systemConfig?.learningGateEnabled ?? true ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
                }`}
              >
                {form.systemConfig?.learningGateEnabled ?? true ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Min trades before a condition can veto</label>
              <input
                type="number"
                min={2}
                className={INPUT}
                value={form.systemConfig?.learningMinSample ?? 5}
                onChange={(e) => setForm((f) => ({ ...f, systemConfig: { ...f.systemConfig, learningMinSample: Math.max(2, parseInt(e.target.value, 10) || 2) } }))}
                onBlur={() => updateSystemConfig({ learningMinSample: form.systemConfig.learningMinSample }, `Learning min-sample set to ${form.systemConfig.learningMinSample}`)}
              />
              <p className="mt-1 text-xs text-muted">Higher = more evidence required before the AI avoids a condition (fewer false vetoes).</p>
            </div>
          </Card>

          <Card>
            <div className="mb-4 font-display font-semibold">Options Strategy</div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/30 p-3">
              <div>
                <div className="text-sm font-medium">Volatility straddle</div>
                <p className="text-xs text-muted">
                  Today, a HIGH_VOLATILITY market regime (violent, no clear direction) is a pure sit-out for options. Turning
                  this on lets the auto-trader instead buy both a CE and a PE (a long straddle) in that regime — profits from
                  a big move either way, direction doesn't matter. Off by default: it opens two positions per trade at once,
                  a different risk shape from every other strategy here.
                </p>
              </div>
              <button
                onClick={() => updateSystemConfig({ volatilityStraddleEnabled: !form.systemConfig?.volatilityStraddleEnabled }, `Volatility straddle turned ${!form.systemConfig?.volatilityStraddleEnabled ? 'on' : 'off'}`)}
                className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                  form.systemConfig?.volatilityStraddleEnabled ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
                }`}
              >
                {form.systemConfig?.volatilityStraddleEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'risk' && (
        <div className="space-y-6">
          <Card>
            <p className="text-xs text-muted">
              Daily loss limits, profit target, consecutive-loss stop, and the kill switch live on the{' '}
              <Link to="/risk" className="text-accent underline">Risk page</Link> — this tab is only position-level
              auto-exit management.
            </p>
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
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-6">
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
        </div>
      )}
    </div>
  );
}

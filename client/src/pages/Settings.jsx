import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { Card } from '../components/common/Card.jsx';
import { INRInput } from '../components/common/INRInput.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { BTN_PRIMARY } from '../lib/ui.js';
import { toast } from '../store/useToastStore.js';

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const fetch = useSettingsStore((s) => s.fetch);
  const update = useSettingsStore((s) => s.update);
  const [form, setForm] = useState(null);

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
          Picks / watchlist badges / Portfolio AI View) runs every {form.aiScanIntervalMinutes ?? 5} minutes regardless of
          this setting.
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

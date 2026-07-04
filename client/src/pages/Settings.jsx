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

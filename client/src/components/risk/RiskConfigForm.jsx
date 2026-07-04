import { useState, useEffect } from 'react';
import { Card } from '../common/Card.jsx';
import { INRInput } from '../common/INRInput.jsx';
import { BTN_PRIMARY, INPUT } from '../../lib/ui.js';
import { toast } from '../../store/useToastStore.js';

export function RiskConfigForm({ config, onSave }) {
  const [form, setForm] = useState(config ?? null);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  if (!form) return null;

  async function save() {
    try {
      await onSave({
        maxLossPerDay: form.maxLossPerDay,
        maxLossPerTrade: form.maxLossPerTrade,
        maxTradesPerDay: form.maxTradesPerDay,
        maxCapitalPerTradePercent: form.maxCapitalPerTradePercent,
      });
      toast.success('Risk config updated');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <Card>
      <div className="mb-4 font-display font-semibold">Risk Configuration</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Max loss per day</label>
          <INRInput value={form.maxLossPerDay} onChange={(v) => setForm((f) => ({ ...f, maxLossPerDay: v }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Max loss per trade</label>
          <INRInput value={form.maxLossPerTrade} onChange={(v) => setForm((f) => ({ ...f, maxLossPerTrade: v }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Max trades per day</label>
          <input
            type="number"
            className={INPUT}
            value={form.maxTradesPerDay}
            onChange={(e) => setForm((f) => ({ ...f, maxTradesPerDay: parseInt(e.target.value, 10) || 0 }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Max capital per trade (%)</label>
          <input
            type="number"
            className={INPUT}
            value={form.maxCapitalPerTradePercent}
            onChange={(e) => setForm((f) => ({ ...f, maxCapitalPerTradePercent: parseFloat(e.target.value) || 0 }))}
          />
        </div>
      </div>
      <button onClick={save} className={`${BTN_PRIMARY} mt-4`}>
        Save Risk Config
      </button>
    </Card>
  );
}

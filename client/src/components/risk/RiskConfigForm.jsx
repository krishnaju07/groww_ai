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
        dailyProfitLockPercent: form.dailyProfitLockPercent,
        dailyProfitTarget: form.dailyProfitTarget,
        maxConsecutiveLosses: form.maxConsecutiveLosses,
      });
      toast.success('Risk config updated');
    } catch (err) {
      toast.error(err.message);
    }
  }

  const PROFIT_TARGET_PRESETS = [500, 1000, 2000, 5000];

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
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted">Daily profit target (₹, 0 = off)</label>
          <div className="flex flex-wrap items-center gap-2">
            <INRInput value={form.dailyProfitTarget ?? 0} onChange={(v) => setForm((f) => ({ ...f, dailyProfitTarget: v }))} />
            {PROFIT_TARGET_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setForm((f) => ({ ...f, dailyProfitTarget: amt }))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  form.dailyProfitTarget === amt ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted hover:border-border'
                }`}
              >
                ₹{amt}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            The Golden Rule stop — once today's realized profit reaches this, new entries stop for the day (no greed).
            Open positions are still managed to close. Takes precedence over the % lock below.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Stop after N consecutive losses (0 = off)</label>
          <input
            type="number"
            min={0}
            className={INPUT}
            value={form.maxConsecutiveLosses ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, maxConsecutiveLosses: parseInt(e.target.value, 10) || 0 }))}
          />
          <p className="mt-1 text-xs text-muted">No revenge trading — pause new entries after this many losses in a row today.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Daily profit lock (% of capital, 0 = off)</label>
          <input
            type="number"
            className={INPUT}
            value={form.dailyProfitLockPercent ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, dailyProfitLockPercent: parseFloat(e.target.value) || 0 }))}
          />
          <p className="mt-1 text-xs text-muted">Secondary % cap — used only if the ₹ target above is off (0).</p>
        </div>
      </div>
      <button onClick={save} className={`${BTN_PRIMARY} mt-4`}>
        Save Risk Config
      </button>
    </Card>
  );
}

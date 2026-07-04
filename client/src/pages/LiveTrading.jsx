import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { useBrokerStore } from '../store/useBrokerStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { Card } from '../components/common/Card.jsx';
import { INRInput } from '../components/common/INRInput.jsx';
import { LiveAutoTradingConfirmModal } from '../components/common/LiveAutoTradingConfirmModal.jsx';
import { TradingModeToggle } from '../components/brokers/TradingModeToggle.jsx';
import { toast } from '../store/useToastStore.js';

/**
 * The single place to answer "am I trading with pretend money or real money right
 * now, and what's allowed to happen automatically" — consolidates what used to be
 * split across Brokers (mode/broker toggle) and Settings (live-money switches).
 * Broker credentials still live on the Brokers page; loss limits/kill switch still
 * live on the Risk page — this page links to both for the pieces it doesn't own.
 */
export function LiveTrading() {
  const settings = useSettingsStore((s) => s.settings);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const fetchSettings = useSettingsStore((s) => s.fetch);
  const update = useSettingsStore((s) => s.update);
  const brokerStatus = useBrokerStore((s) => s.status);
  const fetchBrokerStatus = useBrokerStore((s) => s.fetch);
  const [form, setForm] = useState(null);
  const [showLiveAutoConfirm, setShowLiveAutoConfirm] = useState(false);

  usePolling(fetchBrokerStatus, 15000);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  function refreshAll() {
    fetchSettings();
    fetchBrokerStatus();
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

  if (!form) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Live Trading</h1>
        <p className="text-sm text-muted">Paper vs real money, which broker, and every switch that gates real-money orders — all in one place.</p>
      </div>

      <TradingModeToggle tradingMode={tradingMode} brokerStatus={brokerStatus} onChanged={refreshAll} />

      <Card>
        <div className="mb-4 font-display font-semibold">Live-Money Safety Switches</div>
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
        </div>

        {showLiveAutoConfirm && (
          <LiveAutoTradingConfirmModal onConfirm={confirmLiveAutoTrading} onCancel={() => setShowLiveAutoConfirm(false)} />
        )}
      </Card>

      <Card>
        <p className="text-xs text-muted">
          Loss limits, daily profit lock, and the kill switch live on the <Link to="/risk" className="text-accent underline">Risk page</Link>.
          Connecting or reconnecting a broker account lives on the <Link to="/brokers" className="text-accent underline">Brokers page</Link>.
          AI provider choice, confidence threshold, and other tuning live on <Link to="/settings" className="text-accent underline">Settings</Link>.
        </p>
      </Card>
    </div>
  );
}

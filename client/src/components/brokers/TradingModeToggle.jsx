import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { BTN_SECONDARY } from '../../lib/ui.js';
import { settingsService } from '../../services/settings.service.js';
import { toast } from '../../store/useToastStore.js';
import { brokersService } from '../../services/brokers.service.js';

const BROKER_LABELS = { paper: 'Paper', groww: 'Groww', angelone: 'Angel One', zerodha: 'Zerodha' };

/**
 * @param {{tradingMode:object, brokerStatus:object, onChanged:()=>void}} props
 */
export function TradingModeToggle({ tradingMode, brokerStatus, onChanged }) {
  if (!tradingMode) return null;

  const gates = [
    { label: 'Live trading enabled on server', ok: tradingMode.liveEnabledEnv },
    { label: 'Broker credential configured', ok: tradingMode.hasCredential },
    { label: 'Kill switch not engaged', ok: !tradingMode.killSwitchEngaged },
    { label: 'You selected live mode', ok: tradingMode.mode === 'live' },
  ];

  async function setBroker(broker) {
    try {
      await brokersService.setActive(broker);
      await settingsService.updateTradingMode({ activeBroker: broker });
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function setMode(mode) {
    try {
      await settingsService.updateTradingMode({ tradingMode: mode });
      onChanged();
      toast[mode === 'live' ? 'error' : 'success'](`Switched to ${mode.toUpperCase()} mode`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Trading Mode &amp; Safety Gate</div>

      <div className="mb-4 flex gap-2">
        {['paper', 'live'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors ${
              tradingMode.mode === m
                ? m === 'live'
                  ? 'border-danger/50 bg-danger/10 text-danger'
                  : 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border/70 text-muted'
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Active broker</label>
        <div className="flex flex-wrap gap-2">
          {Object.keys(BROKER_LABELS).map((b) => (
            <button
              key={b}
              onClick={() => setBroker(b)}
              disabled={b !== 'paper' && !brokerStatus?.[b]?.connected}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-30 ${
                tradingMode.activeBroker === b ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/70 text-muted'
              }`}
            >
              {BROKER_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        {gates.map((g) => (
          <div key={g.label} className="flex items-center justify-between">
            <span className="text-muted">{g.label}</span>
            <Badge tone={g.ok ? 'accent' : 'danger'}>{g.ok ? 'OK' : 'Not met'}</Badge>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        All four conditions above, plus a per-order REAL MONEY confirmation, must hold before any live order can be placed.
      </p>
    </Card>
  );
}

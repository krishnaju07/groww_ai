import { ShieldCheck, Sparkles } from 'lucide-react';
import Card from '../common/Card';
import ToggleSwitch from '../common/ToggleSwitch';
import RangeSlider from '../common/RangeSlider';
import InfoHint from '../common/InfoHint';
import { cx, GLASS_PANEL, LABEL, PILL } from '../../lib/ui';

/**
 * @typedef {import('../../types').UserSettings} UserSettings
 */

// §2 VALIDATION ranges for the auto-exit rules (server enforces the same on PUT /settings).
const STOP_LOSS = { min: 0.5, max: 20, step: 0.1 };
const TAKE_PROFIT = { min: 0.5, max: 50, step: 0.1 };
const TRAILING = { min: 0, max: 10, step: 0.1 };

/**
 * AutoExitSettings — toggles AI auto-exit and configures stop-loss, take-profit,
 * trailing-stop, and AI-exit-signal rules for open positions.
 *
 * @param {Object} props
 * @param {UserSettings} props.settings                          Current draft settings.
 * @param {(patch: Partial<UserSettings>) => void} props.onChange Emit a partial settings patch.
 * @returns {JSX.Element}
 */
export default function AutoExitSettings({ settings, onChange }) {
  const autoExit = settings?.autoExit || {};
  const enabled = Boolean(autoExit.enabled);
  const stopLossPercent = Number.isFinite(autoExit.stopLossPercent)
    ? autoExit.stopLossPercent
    : 2.5;
  const takeProfitPercent = Number.isFinite(autoExit.takeProfitPercent)
    ? autoExit.takeProfitPercent
    : 5;
  const trailingStopPercent = Number.isFinite(autoExit.trailingStopPercent)
    ? autoExit.trailingStopPercent
    : 1.5;
  const useAiExitSignal = Boolean(autoExit.useAiExitSignal);

  const patch = (next) => onChange({ autoExit: { ...autoExit, ...next } });

  return (
    <Card
      title="Auto-Exit"
      subtitle="Close positions automatically on risk/AI rules"
      className={cx(
        'h-full transition-all duration-300',
        enabled && 'border-accent/30 shadow-glow ring-1 ring-accent/30'
      )}
      action={
        <span
          className={cx(
            'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
            enabled
              ? 'border-accent/40 bg-accent/15 text-accent'
              : 'border-white/10 bg-white/[0.04] text-muted'
          )}
        >
          <ShieldCheck size={16} />
        </span>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <ToggleSwitch
            label="Enable auto-exit"
            enabled={enabled}
            onChange={(next) => patch({ enabled: next })}
          />
          <span
            className={cx(
              PILL,
              enabled
                ? 'border border-accent/25 bg-accent/12 text-accent'
                : 'border border-white/10 bg-white/5 text-muted'
            )}
          >
            {enabled ? 'Active' : 'Off'}
          </span>
        </div>

        <div className={cx('flex flex-col gap-6', enabled ? '' : 'pointer-events-none opacity-50')}>
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className={LABEL}>Stop loss</span>
              <InfoHint text="Sell if a position falls this % below its entry price." />
            </div>
            <RangeSlider
              label="Stop loss"
              value={stopLossPercent}
              min={STOP_LOSS.min}
              max={STOP_LOSS.max}
              step={STOP_LOSS.step}
              onChange={(v) => patch({ stopLossPercent: v })}
              format={(v) => `${v.toFixed(1)}%`}
            />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className={LABEL}>Take profit</span>
              <InfoHint text="Sell to lock in gains once a position rises this % above entry." />
            </div>
            <RangeSlider
              label="Take profit"
              value={takeProfitPercent}
              min={TAKE_PROFIT.min}
              max={TAKE_PROFIT.max}
              step={TAKE_PROFIT.step}
              onChange={(v) => patch({ takeProfitPercent: v })}
              format={(v) => `${v.toFixed(1)}%`}
            />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className={LABEL}>Trailing stop</span>
              <InfoHint text="Trails the peak price by this %; sells if it pulls back. 0 = off." />
            </div>
            <RangeSlider
              label="Trailing stop (0 = disabled)"
              value={trailingStopPercent}
              min={TRAILING.min}
              max={TRAILING.max}
              step={TRAILING.step}
              onChange={(v) => patch({ trailingStopPercent: v })}
              format={(v) => (v <= 0 ? 'Off' : `${v.toFixed(1)}%`)}
            />
          </div>

          <div className={cx(GLASS_PANEL, 'flex flex-col gap-3 p-4')}>
            <ToggleSwitch
              label="Use AI SELL exit signal"
              enabled={useAiExitSignal}
              onChange={(next) => patch({ useAiExitSignal: next })}
            />
            <p className="flex items-start gap-2 text-xs text-muted">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
              When enabled, a high-confidence AI SELL signal can close a position even
              before stop-loss or take-profit is hit.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

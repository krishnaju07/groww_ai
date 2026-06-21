import { Bot, Zap } from 'lucide-react';
import Card from '../common/Card';
import ToggleSwitch from '../common/ToggleSwitch';
import RangeSlider from '../common/RangeSlider';
import InfoHint from '../common/InfoHint';
import { formatDateTime } from '../../lib/format';
import { cx, GLASS_PANEL, LABEL, PILL } from '../../lib/ui';

/**
 * @typedef {import('../../types').UserSettings} UserSettings
 */

/**
 * AutoInvestSettings — toggles AI auto-invest and sets the minimum confidence
 * threshold a BUY signal must clear before the engine opens a position.
 *
 * @param {Object} props
 * @param {UserSettings} props.settings                          Current draft settings.
 * @param {(patch: Partial<UserSettings>) => void} props.onChange Emit a partial settings patch.
 * @returns {JSX.Element}
 */
export default function AutoInvestSettings({ settings, onChange }) {
  const autoInvest = settings?.autoInvest || {};
  const enabled = Boolean(autoInvest.enabled);
  const minConfidenceScore = Number.isFinite(autoInvest.minConfidenceScore)
    ? autoInvest.minConfidenceScore
    : 75;

  const setEnabled = (next) =>
    onChange({ autoInvest: { ...autoInvest, enabled: next } });

  const setConfidence = (next) =>
    onChange({ autoInvest: { ...autoInvest, minConfidenceScore: next } });

  return (
    <Card
      title="Auto-Invest"
      subtitle="Open positions automatically on strong AI BUY signals"
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
          <Bot size={16} />
        </span>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <ToggleSwitch
            label="Enable auto-invest"
            enabled={enabled}
            onChange={setEnabled}
          />
          <span
            className={cx(
              PILL,
              enabled
                ? 'border border-accent/25 bg-accent/12 text-accent'
                : 'border border-white/10 bg-white/5 text-muted'
            )}
          >
            <Zap size={12} />
            {enabled ? 'Active' : 'Off'}
          </span>
        </div>

        <div className={enabled ? '' : 'pointer-events-none opacity-50'}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className={LABEL}>Confidence threshold</span>
            <InfoHint text="Auto-invest only triggers on BUY signals at/above this confidence." />
          </div>
          <RangeSlider
            label="Minimum confidence score"
            value={minConfidenceScore}
            min={0}
            max={100}
            step={1}
            onChange={setConfidence}
            format={(v) => `${Math.round(v)}%`}
          />
          <p className="mt-2 text-xs text-muted">
            Only BUY signals at or above this confidence trigger an automatic trade.
          </p>
        </div>

        {autoInvest.lastExecutedAt && (
          <div className={cx(GLASS_PANEL, 'flex items-center justify-between gap-3 px-3 py-2.5')}>
            <span className={LABEL}>Last auto-invest</span>
            <span className="text-xs font-medium text-text">
              {formatDateTime(autoInvest.lastExecutedAt)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

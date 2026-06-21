import { Wallet } from 'lucide-react';
import Card from '../common/Card';
import RangeSlider from '../common/RangeSlider';
import INRInput from '../common/INRInput';
import { formatINR } from '../../lib/format';
import { cx, GLASS_PANEL, LABEL, NUM, GRADIENT_TEXT } from '../../lib/ui';

/**
 * @typedef {import('../../types').UserSettings} UserSettings
 */

// §2 VALIDATION.minInvestmentFloor — server enforces the same lower bound on PUT /settings.
const MIN_INVESTMENT_FLOOR = 500;
// Slider bounds for the per-trade investment limits (paper-trading sensible range).
const LIMIT_SLIDER = { min: 500, max: 200_000, step: 500 };

/**
 * InvestmentLimits — edits the per-trade min/max investment band.
 * Each control updates the draft via `onChange(patch)` (a partial UserSettings).
 *
 * @param {Object} props
 * @param {UserSettings} props.settings                       Current draft settings.
 * @param {(patch: Partial<UserSettings>) => void} props.onChange Emit a partial settings patch.
 * @returns {JSX.Element}
 */
export default function InvestmentLimits({ settings, onChange }) {
  const minInvestment = Number(settings?.minInvestment) || 0;
  const maxInvestment = Number(settings?.maxInvestment) || 0;

  const setMin = (value) => onChange({ minInvestment: value });
  const setMax = (value) => onChange({ maxInvestment: value });

  // Cross-field validity surfaced inline (server enforces the same in §11).
  const minBelowFloor = minInvestment < MIN_INVESTMENT_FLOOR;
  const maxNotAboveMin = maxInvestment <= minInvestment;

  return (
    <Card
      title="Investment Limits"
      subtitle="Per-trade auto-invest band"
      action={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-accent">
          <Wallet size={16} />
        </span>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <INRInput
            label="Minimum per trade"
            value={minInvestment}
            onChange={setMin}
            min={MIN_INVESTMENT_FLOOR}
            placeholder="5000"
            error={minBelowFloor ? `Minimum is ${formatINR(MIN_INVESTMENT_FLOOR)}` : ''}
          />
          <INRInput
            label="Maximum per trade"
            value={maxInvestment}
            onChange={setMax}
            min={minInvestment + 1}
            placeholder="50000"
            error={maxNotAboveMin ? 'Maximum must be greater than minimum' : ''}
          />
        </div>

        <RangeSlider
          label="Minimum per trade"
          value={minInvestment}
          min={LIMIT_SLIDER.min}
          max={LIMIT_SLIDER.max}
          step={LIMIT_SLIDER.step}
          onChange={setMin}
          format={(v) => formatINR(v)}
        />
        <RangeSlider
          label="Maximum per trade"
          value={maxInvestment}
          min={LIMIT_SLIDER.min}
          max={LIMIT_SLIDER.max}
          step={LIMIT_SLIDER.step}
          onChange={setMax}
          format={(v) => formatINR(v)}
        />

        <div className={cx(GLASS_PANEL, 'flex flex-col gap-1 p-4')}>
          <span className={LABEL}>Auto-invest band</span>
          <p className="text-sm text-muted">
            Each qualifying BUY signal draws a random amount within{' '}
            <span className={cx(NUM, 'font-semibold', GRADIENT_TEXT)}>
              {formatINR(minInvestment)} – {formatINR(maxInvestment)}
            </span>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}

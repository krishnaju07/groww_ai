import { useId } from 'react';
import { cx, LABEL, NUM } from '../../lib/ui';

/**
 * RangeSlider — labeled slider with an accent-gradient fill, glowing thumb and a
 * live formatted value chip.
 *
 * @param {Object} props
 * @param {string} [props.label]                        Field label.
 * @param {number} props.value                          Current value.
 * @param {number} props.min                            Minimum value.
 * @param {number} props.max                            Maximum value.
 * @param {number} [props.step=1]                       Step increment.
 * @param {(next:number)=>void} props.onChange          Called with the new numeric value.
 * @param {(v:number)=>React.ReactNode} [props.format]  Formats the readout (defaults to raw value).
 * @returns {JSX.Element}
 */
export default function RangeSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}) {
  const numeric = Number.isFinite(value) ? value : min;
  const range = max - min;
  const pct = range > 0 ? ((numeric - min) / range) * 100 : 0;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const display = format ? format(numeric) : numeric;
  const rawId = useId();
  const cls = `rs-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="w-full">
      {(label || display != null) && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          {label && <span className={LABEL}>{label}</span>}
          <span
            className={cx(
              'rounded-md border border-accent/20 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent',
              NUM,
            )}
          >
            {display}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numeric}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label || 'range'}
        className={cx(
          cls,
          'h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none focus:ring-2 focus:ring-accent/40',
        )}
        style={{
          background: `linear-gradient(to right, #00C853 0%, #00E676 ${clampedPct}%, rgba(255,255,255,0.08) ${clampedPct}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
      <style>{`
        .${cls}::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: #FFFFFF;
          border: 3px solid #00E676;
          box-shadow: 0 0 10px rgba(0,200,83,0.7);
          cursor: pointer;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        .${cls}::-webkit-slider-thumb:hover {
          box-shadow: 0 0 16px rgba(0,200,83,0.9);
          transform: scale(1.08);
        }
        .${cls}::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: #FFFFFF;
          border: 3px solid #00E676;
          box-shadow: 0 0 10px rgba(0,200,83,0.7);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

import { useId } from 'react';
import { cx, GRADIENT_TEXT, NUM } from '../../lib/ui';

/**
 * ConfidenceMeter — circular SVG gauge (0..100) with an accent-gradient progress
 * arc + glow. The center shows the score (gradient text for high confidence).
 *
 * @param {Object} props
 * @param {number} props.score                 Confidence 0..100.
 * @param {'sm'|'md'|'lg'} [props.size='md']   Gauge size.
 * @returns {JSX.Element}
 */
export default function ConfidenceMeter({ score, size = 'md' }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const id = useId().replace(/[:]/g, '');

  const dims = {
    sm: { box: 48, stroke: 5, font: 'text-[11px]' },
    md: { box: 72, stroke: 7, font: 'text-base' },
    lg: { box: 104, stroke: 9, font: 'text-xl' },
  };
  const { box, stroke, font } = dims[size] || dims.md;

  const radius = (box - stroke) / 2;
  const center = box / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const high = clamped >= 70;
  // Solid fallback color for the arc gradient stops based on confidence band.
  const fromColor = high ? '#00C853' : clamped >= 40 ? '#3B82F6' : '#FF5252';
  const toColor = high ? '#00E676' : clamped >= 40 ? '#60A5FA' : '#FF7B7B';

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: box, height: box }}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Confidence"
    >
      <svg width={box} height={box} className="-rotate-90">
        <defs>
          <linearGradient id={`cm-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#cm-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
          style={{ filter: `drop-shadow(0 0 5px ${fromColor}88)` }}
        />
      </svg>
      <span
        className={cx(
          'absolute font-display font-bold',
          font,
          NUM,
          high ? GRADIENT_TEXT : '',
        )}
        style={high ? undefined : { color: fromColor }}
      >
        {Math.round(clamped)}
      </span>
    </div>
  );
}

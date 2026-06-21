import { useId } from 'react';

/**
 * Lightweight SVG sparkline with a gradient area fill, glowing stroke and an
 * end-point dot. No chart library — fast enough to render in every tile/row.
 * @param {Object} props
 * @param {number[]} props.data
 * @param {string} [props.color]        stroke/fill color (default accent green)
 * @param {number} [props.width]
 * @param {number} [props.height]
 * @param {number} [props.strokeWidth]
 * @param {boolean} [props.fill]        render the soft area fill (default true)
 * @param {boolean} [props.dot]         render the end-point dot (default true)
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export default function Sparkline({
  data = [],
  color = '#00E676',
  width = 120,
  height = 36,
  strokeWidth = 2,
  fill = true,
  dot = true,
  className = '',
}) {
  const id = useId().replace(/[:]/g, '');
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth + 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spk-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#spk-${id})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
      />
      {dot && <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.5} fill={color} />}
    </svg>
  );
}

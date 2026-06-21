/**
 * Shimmering skeleton placeholder. Compose size/shape with utility classes,
 * e.g. `<Skeleton className="h-6 w-24" />`.
 * @param {Object} props
 * @param {string} [props.className]
 * @param {string} [props.rounded]  rounding utility (default `rounded-lg`)
 * @returns {JSX.Element}
 */
export default function Skeleton({ className = '', rounded = 'rounded-lg' }) {
  return (
    <div className={`relative overflow-hidden bg-white/[0.04] ${rounded} ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  );
}

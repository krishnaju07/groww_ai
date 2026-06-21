/**
 * Spinner — gradient conic ring loading indicator in three sizes.
 *
 * @param {Object} props
 * @param {'sm'|'md'|'lg'} [props.size='md']  Spinner size.
 * @returns {JSX.Element}
 */
export default function Spinner({ size = 'md' }) {
  const sizes = { sm: 16, md: 24, lg: 40 };
  const px = sizes[size] || sizes.md;
  const thickness = Math.max(2, Math.round(px / 9));

  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-flex items-center justify-center"
      style={{ width: px, height: px }}
    >
      <span
        className="block animate-spin rounded-full"
        style={{
          width: px,
          height: px,
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(0,200,83,0.15) 90deg, #00C853 270deg, #00E676 360deg)',
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
          mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
        }}
      />
    </span>
  );
}

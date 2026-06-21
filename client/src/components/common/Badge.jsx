import { cx, PILL } from '../../lib/ui';

/**
 * Badge — small frosted pill label in one of four semantic variants.
 *
 * @param {Object} props
 * @param {'success'|'danger'|'neutral'|'info'} [props.variant='neutral'] Color variant.
 * @param {React.ReactNode} props.children   Badge content.
 * @param {string} [props.className]          Extra classes.
 * @returns {JSX.Element}
 */
export default function Badge({ variant = 'neutral', children, className = '' }) {
  const variants = {
    success: 'bg-accent/12 text-accent border border-accent/25',
    danger: 'bg-danger/12 text-danger border border-danger/25',
    info: 'bg-info/12 text-info border border-info/25',
    neutral: 'bg-white/5 text-muted border border-white/10',
  };

  const variantClass = variants[variant] || variants.neutral;

  return (
    <span className={cx(PILL, 'leading-none', variantClass, className)}>
      {children}
    </span>
  );
}

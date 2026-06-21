import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cx, GLASS_CARD_HOVER, LABEL, NUM } from '../../lib/ui';

/**
 * StatTile — hero metric tile with a label + optional glass-chip icon, a big
 * value (preformatted string from the caller) and an optional colored delta.
 *
 * @param {Object} props
 * @param {string} props.label                  Metric label.
 * @param {React.ReactNode} props.value         Primary value (already formatted by caller).
 * @param {React.ReactNode} [props.delta]       Secondary change text (e.g. "+2.3%").
 * @param {boolean} [props.deltaPositive]       When provided, colors/arrows the delta (true→accent, false→danger).
 * @param {React.ReactNode} [props.icon]        Optional icon element or component rendered top-right.
 * @returns {JSX.Element}
 */
export default function StatTile({ label, value, delta, deltaPositive, icon }) {
  const hasDelta = delta !== undefined && delta !== null && delta !== '';
  const hasDirection = typeof deltaPositive === 'boolean';

  const deltaColor = !hasDirection
    ? 'text-muted'
    : deltaPositive
      ? 'text-accent'
      : 'text-danger';

  const DirectionIcon = deltaPositive ? ArrowUpRight : ArrowDownRight;

  // Allow `icon` to be either an element (<Wallet/>) or a component reference (Wallet).
  let iconNode = null;
  if (icon) {
    if (typeof icon === 'function') {
      const IconComponent = icon;
      iconNode = <IconComponent size={18} />;
    } else {
      iconNode = icon;
    }
  }

  return (
    <div className={cx('group relative overflow-hidden p-5', GLASS_CARD_HOVER)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <p className={LABEL}>{label}</p>
        {iconNode && (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-accent transition-colors group-hover:border-accent/30 group-hover:text-accent2">
            {iconNode}
          </span>
        )}
      </div>
      <p className={cx('mt-3 font-display text-2xl font-bold text-text', NUM)}>
        {value}
      </p>
      {hasDelta && (
        <div
          className={cx(
            'mt-1.5 flex items-center gap-0.5 text-xs font-semibold',
            NUM,
            deltaColor,
          )}
        >
          {hasDirection && <DirectionIcon size={14} strokeWidth={2.5} />}
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}

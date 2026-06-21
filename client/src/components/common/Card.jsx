import { cx, GLASS_CARD, GLASS_CARD_HOVER, LABEL } from '../../lib/ui';

/**
 * Card — frosted-glass surface container with optional title/subtitle header
 * and action slot. A thin top sheen adds depth; pass an `onClick` (via extra
 * className wiring is not needed) — interactivity is opt-in by hover.
 *
 * @param {Object} props
 * @param {string} [props.title]            Header title text (rendered as a LABEL).
 * @param {string} [props.subtitle]         Header subtitle text (muted).
 * @param {React.ReactNode} [props.action]  Right-aligned header action (button/menu/etc.).
 * @param {string} [props.className]         Extra classes for the outer container.
 * @param {React.ReactNode} [props.children] Card body.
 * @returns {JSX.Element}
 */
export default function Card({ title, subtitle, action, className = '', children }) {
  const hasHeader = title || subtitle || action;
  const interactive = /\b(cursor-pointer|group)\b/.test(className);

  return (
    <div
      className={cx(
        'relative overflow-hidden p-5',
        interactive ? GLASS_CARD_HOVER : GLASS_CARD,
        className,
      )}
    >
      {/* Top sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className={cx('truncate', LABEL)}>{title}</h3>}
            {subtitle && (
              <p className="mt-1 truncate text-sm text-muted">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

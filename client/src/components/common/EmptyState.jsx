import { cx, GLOW_ACCENT } from '../../lib/ui';

/**
 * EmptyState — centered placeholder for cards/tables with no data. Shows an
 * icon in a soft-glowing glass chip, a display-font title, a muted message, and
 * an optional action node (e.g. a BTN_PRIMARY link/button).
 *
 * @param {Object} props
 * @param {React.ComponentType<{ size?: number }>|React.ReactNode} [props.icon]  Lucide icon component or node.
 * @param {string} props.title           Headline.
 * @param {string} [props.message]       Supporting muted text.
 * @param {React.ReactNode} [props.action]  Optional CTA node.
 * @returns {JSX.Element}
 */
export default function EmptyState({ icon: Icon, title, message, action }) {
  // Accept either a component (e.g. lucide `Inbox`) or an already-built node.
  let iconNode = null;
  if (Icon) {
    iconNode =
      typeof Icon === 'function' ? <Icon size={22} className="text-accent" /> : Icon;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {iconNode ? (
        <div
          className={cx(
            'flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]',
            GLOW_ACCENT,
          )}
        >
          {iconNode}
        </div>
      ) : null}
      <h3 className="font-display text-base font-semibold text-text">{title}</h3>
      {message ? (
        <p className="max-w-xs text-sm leading-relaxed text-muted">{message}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

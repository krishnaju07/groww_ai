import { useState } from 'react';
import { cx, GLASS_PANEL } from '../../lib/ui';

/**
 * Tooltip — wraps `children` in a focusable trigger and reveals a small glass
 * bubble above or below on hover/focus. Keyboard accessible: the trigger is
 * focusable and the bubble appears on focus as well as hover.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.content       Tooltip body (text or node).
 * @param {React.ReactNode} props.children      The trigger element(s).
 * @param {'top'|'bottom'} [props.side='top']   Which side to show the bubble.
 * @returns {JSX.Element}
 */
export default function Tooltip({ content, children, side = 'top' }) {
  const [open, setOpen] = useState(false);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const positionClass =
    side === 'bottom'
      ? 'top-full mt-2'
      : 'bottom-full mb-2';

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span
        tabIndex={0}
        className="inline-flex rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {children}
      </span>
      {open ? (
        <span
          role="tooltip"
          className={cx(
            'pointer-events-none absolute left-1/2 z-50 w-max max-w-[220px] -translate-x-1/2 px-2.5 py-1.5 text-xs leading-snug text-text shadow-card animate-fade-in',
            GLASS_PANEL,
            positionClass,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

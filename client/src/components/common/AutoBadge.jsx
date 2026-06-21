import { Zap, Hand } from 'lucide-react';
import { cx, PILL } from '../../lib/ui';

/**
 * AutoBadge — distinguishes manual vs automatic trades.
 * manual → subtle white/muted "MANUAL"; automatic → info pill "AUTO" w/ Zap icon.
 *
 * @param {Object} props
 * @param {'manual'|'automatic'} props.type  Trade origin.
 * @returns {JSX.Element}
 */
export default function AutoBadge({ type }) {
  const isAuto = type === 'automatic';
  const Icon = isAuto ? Zap : Hand;
  const className = isAuto
    ? 'bg-info/12 text-info border border-info/25'
    : 'bg-white/5 text-muted border border-white/10';

  return (
    <span className={cx(PILL, 'uppercase tracking-wide leading-none', className)}>
      <Icon size={12} strokeWidth={2.5} />
      <span>{isAuto ? 'Auto' : 'Manual'}</span>
    </span>
  );
}

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cx, PILL } from '../../lib/ui';

/**
 * SignalBadge — renders an AI signal (BUY/SELL/HOLD) with an optional confidence %.
 * BUY = accent gradient pill + glow; SELL = danger pill; HOLD = neutral glass.
 *
 * @param {Object} props
 * @param {'BUY'|'SELL'|'HOLD'} props.signal  Signal type.
 * @param {number} [props.confidence]         Confidence 0..100 (appended when provided).
 * @returns {JSX.Element}
 */
export default function SignalBadge({ signal, confidence }) {
  const config = {
    BUY: {
      label: 'BUY',
      Icon: TrendingUp,
      className:
        'bg-gradient-to-r from-[#00C853] to-[#00E676] text-[#04210F] border border-white/10 shadow-[0_0_18px_rgba(0,200,83,0.35)]',
      sub: 'text-[#04210F]/70',
    },
    SELL: {
      label: 'SELL',
      Icon: TrendingDown,
      className:
        'bg-danger/15 text-danger border border-danger/30 shadow-[0_0_18px_rgba(255,82,82,0.25)]',
      sub: 'text-danger/70',
    },
    HOLD: {
      label: 'HOLD',
      Icon: Minus,
      className: 'bg-white/5 text-muted border border-white/10',
      sub: 'text-muted/70',
    },
  };

  const { label, Icon, className, sub } = config[signal] || config.HOLD;
  const showConfidence = Number.isFinite(confidence);

  return (
    <span className={cx(PILL, 'leading-none', className)}>
      <Icon size={13} strokeWidth={2.5} />
      <span>{label}</span>
      {showConfidence && (
        <span className={cx('num font-bold', sub)}>{Math.round(confidence)}%</span>
      )}
    </span>
  );
}

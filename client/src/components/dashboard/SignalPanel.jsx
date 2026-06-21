import { Radar } from 'lucide-react';
import SignalBadge from '../common/SignalBadge';
import ConfidenceMeter from '../common/ConfidenceMeter';
import { GLASS_PANEL, cx } from '../../lib/ui';

/**
 * Vertical list of AI signal rows (symbol, SignalBadge, reason, ConfidenceMeter).
 * The top (highest-confidence) row is highlighted with an accent ring.
 * @param {Object} props
 * @param {import('../../types').AISignal[]} props.signals
 * @returns {JSX.Element}
 */
export default function SignalPanel({ signals }) {
  const rows = Array.isArray(signals) ? signals : [];

  if (rows.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-muted">
          <Radar size={22} />
        </span>
        <p className="text-sm font-medium text-muted">No signals available</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((sig, i) => (
        <li
          key={sig.symbol}
          className={cx(
            GLASS_PANEL,
            'flex items-center gap-4 px-3.5 py-3 transition-colors hover:bg-white/[0.04]',
            i === 0 && 'border-accent/30 ring-1 ring-accent/25 shadow-[0_0_24px_-8px_rgba(0,200,83,0.35)]',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-text">{sig.symbol}</span>
              <SignalBadge signal={sig.signal} confidence={sig.confidence} />
            </div>
            <p className="mt-1 truncate text-xs text-muted" title={sig.reason}>
              {sig.reason}
            </p>
          </div>
          <div className="shrink-0">
            <ConfidenceMeter score={sig.confidence} size="sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

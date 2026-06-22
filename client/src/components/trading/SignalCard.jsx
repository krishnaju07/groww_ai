import { Activity, BarChart3, Cpu, Gauge, Layers } from 'lucide-react';
import SignalBadge from '../common/SignalBadge';
import ConfidenceMeter from '../common/ConfidenceMeter';
import InfoHint from '../common/InfoHint';
import Skeleton from '../common/Skeleton';
import { GLASS_CARD, GLASS_PANEL, LABEL, NUM, cx } from '../../lib/ui';

const CONFIDENCE_HINT =
  'AI confidence 0–100 from RSI, MACD, momentum, trend & volume.';

/**
 * @typedef {import('../../types').AISignal} AISignal
 */

/**
 * Format an indicator value for display, guarding non-finite numbers.
 * @param {number} n
 * @param {number} [dp=2]
 * @returns {string}
 */
function fmt(n, dp = 2) {
  return Number.isFinite(n) ? n.toFixed(dp) : '—';
}

/**
 * SignalCard — shows the AI signal for the selected stock: BUY/SELL/HOLD badge,
 * a confidence meter, the human-readable reason, and the underlying indicators.
 *
 * @param {Object} props
 * @param {AISignal|null} [props.signal]  The AI signal (null while none loaded).
 * @param {boolean} [props.loading]       Whether a signal is being fetched.
 * @returns {JSX.Element}
 */
export default function SignalCard({ signal, loading = false }) {
  if (loading && !signal) {
    return (
      <div className={cx(GLASS_CARD, 'p-5')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-28" rounded="rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-[72px] w-[72px]" rounded="rounded-full" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Skeleton className="h-16 w-full" rounded="rounded-xl" />
          <Skeleton className="h-16 w-full" rounded="rounded-xl" />
          <Skeleton className="h-16 w-full" rounded="rounded-xl" />
          <Skeleton className="h-16 w-full" rounded="rounded-xl" />
        </div>
      </div>
    );
  }

  if (!signal) {
    return (
      <div
        className={cx(
          GLASS_CARD,
          'flex h-44 flex-col items-center justify-center gap-2 p-5 text-center',
        )}
      >
        <Gauge size={22} className="text-muted/70" />
        <p className="text-sm text-muted">Select a stock to see its AI signal.</p>
      </div>
    );
  }

  const ind = signal.indicators || {};
  const models = Array.isArray(signal.models) ? signal.models : [];

  const indicators = [
    { label: 'RSI (14)', value: fmt(ind.rsi, 1), Icon: Gauge },
    { label: 'MACD Hist', value: fmt(ind.macd), Icon: BarChart3 },
    { label: 'Momentum', value: `${fmt(ind.momentum)}%`, Icon: Activity },
    { label: 'Vol Ratio', value: `${fmt(ind.volumeRatio)}x`, Icon: Layers },
  ];

  return (
    <div className={cx(GLASS_CARD, 'p-5')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-display text-lg font-bold text-text">
              {signal.symbol}
            </span>
            <SignalBadge signal={signal.signal} confidence={signal.confidence} />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {signal.reason}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ConfidenceMeter score={signal.confidence} size="md" />
          <div className="flex items-center gap-1">
            <span className={LABEL}>Confidence</span>
            <InfoHint text={CONFIDENCE_HINT} side="top" />
          </div>
        </div>
      </div>

      {models.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5">
            <Cpu size={13} className="text-muted/80" />
            <span className={LABEL}>
              {models.length > 1 ? 'Model Consensus' : 'Model'}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {models.map((m) => (
              <div
                key={m.name}
                className={cx(GLASS_PANEL, 'flex items-center gap-3 px-3.5 py-2.5')}
                title={m.reason}
              >
                <span className="w-16 shrink-0 text-xs font-semibold text-text">
                  {m.name}
                </span>
                <SignalBadge signal={m.signal} confidence={m.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {indicators.map(({ label, value, Icon }) => (
          <div key={label} className={cx(GLASS_PANEL, 'px-3.5 py-3')}>
            <div className="flex items-center gap-1.5">
              <Icon size={13} className="text-muted/80" />
              <span className={LABEL}>{label}</span>
            </div>
            <div className={cx(NUM, 'mt-1.5 text-base font-bold text-text')}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className={cx(GLASS_PANEL, 'px-3.5 py-2.5')}>
          <span className={LABEL}>SMA 20</span>
          <div className={cx(NUM, 'mt-1 text-sm font-semibold text-text')}>
            {fmt(ind.sma20)}
          </div>
        </div>
        <div className={cx(GLASS_PANEL, 'px-3.5 py-2.5')}>
          <span className={LABEL}>SMA 50</span>
          <div className={cx(NUM, 'mt-1 text-sm font-semibold text-text')}>
            {fmt(ind.sma50)}
          </div>
        </div>
      </div>
    </div>
  );
}

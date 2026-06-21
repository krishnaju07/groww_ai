import { useEffect, useRef, useState } from 'react';
import { Bell, ArrowUpRight, ArrowDownRight, BellOff } from 'lucide-react';
import * as tradesService from '../../services/trades.service';
import AutoBadge from '../common/AutoBadge';
import { formatINR, formatDateTime } from '../../lib/format';
import { cx, GLASS_CARD, LABEL, NUM, GLOW_ACCENT } from '../../lib/ui';

/**
 * NotificationsBell — a Bell icon button in the navbar that opens a glass
 * popover listing the latest ~8 trades (manual + automatic).
 *
 * Behavior:
 *  - Click the bell to toggle a right-aligned glass popover.
 *  - On open it fetches `tradesService.getTrades({ limit: 8 })`.
 *  - Each row: action arrow + symbol + qty + formatINR(price) + AutoBadge + time.
 *  - An accent dot marks the bell when recent automatic trades exist.
 *  - Closes on outside click and on Esc.
 *
 * No props.
 * @returns {JSX.Element}
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasAuto, setHasAuto] = useState(false);
  const containerRef = useRef(null);

  // Fetch the latest trades whenever the popover is opened.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await tradesService.getTrades({ limit: 8 });
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setTrades(rows);
        setHasAuto(rows.some((t) => t.tradeType === 'automatic'));
      } catch {
        if (!cancelled) setTrades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on outside click + Esc while open.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        className={cx(
          'relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-muted transition-all',
          'hover:border-white/20 hover:bg-white/[0.06] hover:text-text',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          open && 'border-white/20 bg-white/[0.06] text-text'
        )}
      >
        <Bell size={18} />
        {hasAuto && (
          <span
            className={cx(
              'absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gradient-to-br from-[#00C853] to-[#00E676]',
              GLOW_ACCENT
            )}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Recent activity"
          className={cx(
            GLASS_CARD,
            'absolute right-0 top-full z-50 mt-2 w-80 origin-top-right animate-fade-in-up overflow-hidden p-0'
          )}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className={LABEL}>Recent Activity</span>
            {hasAuto && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Auto active
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-white/[0.04]"
                  />
                ))}
              </div>
            ) : trades.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center gap-2 text-muted">
                <BellOff size={20} />
                <p className="text-xs font-medium">No activity yet</p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {trades.map((t) => {
                  const isBuy = t.action === 'BUY';
                  const ActionIcon = isBuy ? ArrowUpRight : ArrowDownRight;
                  return (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 border-b border-white/[0.04] px-4 py-3 transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <span
                        className={cx(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          isBuy
                            ? 'bg-accent/12 text-accent'
                            : 'bg-danger/12 text-danger'
                        )}
                      >
                        <ActionIcon size={15} strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="font-display text-sm font-semibold text-text">
                              {t.symbol}
                            </span>
                            <span
                              className={cx(
                                'text-[11px] font-semibold',
                                isBuy ? 'text-accent' : 'text-danger'
                              )}
                            >
                              {t.action}
                            </span>
                          </span>
                          <AutoBadge type={t.tradeType} />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted">
                            <span className={cx(NUM, 'text-text')}>
                              {t.quantity}
                            </span>{' '}
                            @{' '}
                            <span className={cx(NUM, 'text-text')}>
                              {formatINR(t.price)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] text-muted">
                            {formatDateTime(t.openedAt)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

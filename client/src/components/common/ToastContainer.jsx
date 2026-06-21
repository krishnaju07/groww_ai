import { CheckCircle2, XCircle, Info, Zap, X } from 'lucide-react';
import useToastStore from '../../store/useToastStore.js';
import { cx, GLASS_CARD } from '../../lib/ui';

/**
 * Per-type presentation: left accent bar color, icon, and icon tint.
 * success = accent, error = danger, info = info, auto = accent2 (+ Zap).
 */
const TOAST_STYLES = {
  success: { bar: 'bg-accent', icon: CheckCircle2, iconClass: 'text-accent' },
  error: { bar: 'bg-danger', icon: XCircle, iconClass: 'text-danger' },
  info: { bar: 'bg-info', icon: Info, iconClass: 'text-info' },
  auto: { bar: 'bg-accent2', icon: Zap, iconClass: 'text-accent2' },
};

/**
 * ToastContainer — fixed bottom-right stack of transient glass toasts.
 * Reads `useToastStore`; mounted once in Layout. No props.
 *
 * @returns {JSX.Element}
 */
export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-[360px] flex-col gap-2"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const style = TOAST_STYLES[t.type] || TOAST_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden p-3 pl-4 animate-fade-in-up',
              GLASS_CARD,
            )}
          >
            {/* Left accent bar */}
            <span
              aria-hidden="true"
              className={cx('absolute inset-y-0 left-0 w-1', style.bar)}
            />
            <Icon size={18} className={cx('mt-0.5 shrink-0', style.iconClass)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-text">{t.title}</p>
              {t.message ? (
                <p className="mt-0.5 break-words text-xs leading-snug text-muted">
                  {t.message}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

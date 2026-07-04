import { useToastStore } from '../../store/useToastStore.js';

const TONE_CLASS = {
  accent: 'border-accent/40 bg-accent/10 text-accent',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-info/40 bg-info/10 text-info',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`glass-card pointer-events-auto animate-fade-in-up cursor-pointer border px-4 py-3 text-sm font-medium ${TONE_CLASS[t.tone] || TONE_CLASS.info}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

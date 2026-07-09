export const GRADIENT_TEXT = 'gradient-text font-display font-bold';

export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-accent-grad px-4 py-2.5 font-semibold text-bg shadow-glow transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none';
export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/60 px-4 py-2.5 font-medium text-text transition-colors hover:border-accent/50 hover:bg-surface disabled:opacity-40 disabled:pointer-events-none';
export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 font-semibold text-white shadow-[0_0_24px_rgba(255,82,82,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none';

export const INPUT =
  'w-full rounded-xl border border-border bg-bg/60 px-3.5 py-2.5 text-text placeholder:text-muted/60 outline-none transition-colors focus:border-accent/60';

/** @param {'BUY'|'SELL'|'WAIT'} action @returns {string} */
export function actionBadgeClass(action) {
  if (action === 'BUY') return 'bg-accent/15 text-accent border border-accent/30';
  if (action === 'SELL') return 'bg-danger/15 text-danger border border-danger/30';
  return 'bg-muted/15 text-muted border border-muted/30';
}

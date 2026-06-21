/**
 * Canonical Tailwind class recipes for the GrowwAI "glass + glow" design system.
 * Import these everywhere so the visual language stays consistent. They are full
 * literal strings so Tailwind's JIT can see and generate the classes.
 */

/** Frosted-glass card surface (static). */
export const GLASS_CARD =
  'rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.05] to-white/[0.015] backdrop-blur-xl shadow-card';

/** Interactive glass card: hover lift + accent glow + brighter border. */
export const GLASS_CARD_HOVER =
  GLASS_CARD +
  ' transition-all duration-300 hover:border-white/[0.12] hover:shadow-[0_16px_48px_-12px_rgba(0,200,83,0.18)] hover:-translate-y-0.5';

/** Nested inner panel / secondary surface. */
export const GLASS_PANEL =
  'rounded-xl border border-white/[0.05] bg-white/[0.02] backdrop-blur-md';

/** Accent gradient text (big values / brand). Pair with `num` for figures. */
export const GRADIENT_TEXT =
  'bg-gradient-to-r from-[#00E676] via-[#34D399] to-[#00C853] bg-clip-text text-transparent';

/** Accent gradient fill (bars / accents). */
export const GRADIENT_ACCENT = 'bg-gradient-to-r from-[#00C853] to-[#00E676]';

/** Soft glows. */
export const GLOW_ACCENT = 'shadow-[0_0_24px_rgba(0,200,83,0.25)]';
export const GLOW_DANGER = 'shadow-[0_0_24px_rgba(255,82,82,0.25)]';

/** Primary CTA button. */
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00C853] to-[#00E676] px-4 py-2.5 text-sm font-semibold text-[#04210F] shadow-[0_4px_20px_-4px_rgba(0,200,83,0.5)] transition-all hover:shadow-[0_6px_28px_-4px_rgba(0,200,83,0.7)] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100';

/** Secondary / ghost button. */
export const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text transition-all hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

/** Danger / destructive ghost button. */
export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition-all hover:bg-danger/20 hover:border-danger/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

/** Pill / chip base. */
export const PILL = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold';

/** Section heading (small caps label). */
export const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-muted';

/** Tabular figures for aligned numbers. */
export const NUM = 'num';

/** Tiny className combiner (truthy parts joined by spaces). */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

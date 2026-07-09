/** Thin horizontal confidence/score bar — the compact sibling of ConfidenceMeter for list rows. */
export function ConfidenceBar({ value = 0, className = '' }) {
  const pct = Math.min(100, Math.max(0, value));
  const colorClass = pct >= 66 ? 'bg-accent' : pct >= 33 ? 'bg-warn' : 'bg-danger';

  return (
    <div className={`h-1 overflow-hidden rounded-full bg-border/50 ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

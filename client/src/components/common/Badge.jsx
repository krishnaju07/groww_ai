export function Badge({ children, className = '', tone = 'default' }) {
  const tones = {
    default: 'bg-muted/15 text-muted border-muted/30',
    accent: 'bg-accent/15 text-accent border-accent/30',
    danger: 'bg-danger/15 text-danger border-danger/30',
    warn: 'bg-warn/15 text-warn border-warn/30',
    info: 'bg-info/15 text-info border-info/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

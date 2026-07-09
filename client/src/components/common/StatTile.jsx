import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from './Card.jsx';
import { AnimatedNumber } from './AnimatedNumber.jsx';

/**
 * @param {{label:string, value:number, format:(n:number)=>string, sub?:string,
 *   tone?:'default'|'accent'|'danger', icon?:React.ComponentType, deltaPercent?:number}} props
 */
export function StatTile({ label, value, format, sub, tone = 'default', icon: Icon, deltaPercent }) {
  const toneClass = { default: 'text-text', accent: 'text-accent', danger: 'text-danger' }[tone];
  const iconToneClass = { default: 'bg-muted/10 text-muted', accent: 'bg-accent/10 text-accent', danger: 'bg-danger/10 text-danger' }[tone];

  return (
    <Card hover className="overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        {Icon && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconToneClass}`}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className={`mt-2 font-display text-[1.75rem] font-bold leading-tight tracking-tight ${toneClass}`}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {(sub || deltaPercent != null) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {deltaPercent != null && (
            <span className={`flex items-center gap-0.5 font-semibold ${deltaPercent >= 0 ? 'text-accent' : 'text-danger'}`}>
              {deltaPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(deltaPercent).toFixed(2)}%
            </span>
          )}
          {sub && <span className="text-muted">{sub}</span>}
        </div>
      )}
    </Card>
  );
}

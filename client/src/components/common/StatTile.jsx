import { Card } from './Card.jsx';
import { AnimatedNumber } from './AnimatedNumber.jsx';

/**
 * @param {{label:string, value:number, format:(n:number)=>string, sub?:string, tone?:'default'|'accent'|'danger'}} props
 */
export function StatTile({ label, value, format, sub, tone = 'default' }) {
  const toneClass = { default: 'text-text', accent: 'text-accent', danger: 'text-danger' }[tone];
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-2xl font-bold ${toneClass}`}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

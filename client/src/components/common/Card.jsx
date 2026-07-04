import { GLASS_CARD } from '../../lib/ui.js';

export function Card({ className = '', children, hover = false, ...rest }) {
  return (
    <div className={`${GLASS_CARD} ${hover ? 'transition-all duration-300 hover:border-accent/40 hover:shadow-glow' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

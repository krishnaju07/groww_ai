import { useEffect, useRef, useState } from 'react';

/**
 * Count-up animation toward `value`. `format` receives the interpolated number.
 * @param {{value:number, format:(n:number)=>string, duration?:number, className?:string}} props
 */
export function AnimatedNumber({ value, format = (n) => n.toFixed(0), duration = 500, className = '' }) {
  const [display, setDisplay] = useState(value ?? 0);
  const fromRef = useRef(value ?? 0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}

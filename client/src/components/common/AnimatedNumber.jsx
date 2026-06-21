import { useEffect, useRef, useState } from 'react';

/**
 * Smoothly counts from the previous value to `value` (easeOutCubic). Honors
 * `prefers-reduced-motion`. Render the figure via the `format` callback.
 * @param {Object} props
 * @param {number} props.value
 * @param {(n:number)=>string} [props.format]  formatter for the displayed value
 * @param {number} [props.duration]            ms (default 650)
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export default function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  duration = 650,
  className = '',
}) {
  const [display, setDisplay] = useState(Number(value) || 0);
  const fromRef = useRef(Number(value) || 0);
  const rafRef = useRef(0);

  useEffect(() => {
    const to = Number(value) || 0;
    const from = fromRef.current;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return undefined;
    }

    let start = 0;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setDisplay(from + (to - from) * ease(p));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={`num ${className}`}>{format(display)}</span>;
}

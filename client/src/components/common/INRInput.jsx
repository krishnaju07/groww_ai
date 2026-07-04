import { useState, useEffect } from 'react';
import { INPUT } from '../../lib/ui.js';

/**
 * Numeric input that displays a plain editable string internally (so it can be
 * momentarily empty while typing) and reports a parsed number to `onChange`.
 * @param {{value:number, onChange:(n:number)=>void, prefix?:string, placeholder?:string, className?:string}} props
 */
export function INRInput({ value, onChange, prefix = '₹', placeholder, className = '' }) {
  const [display, setDisplay] = useState(value != null ? String(value) : '');

  useEffect(() => {
    if (value != null && String(value) !== display) setDisplay(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e) {
    const raw = e.target.value.replace(/[^\d.]/g, '');
    setDisplay(raw);
    const n = parseFloat(raw);
    onChange(Number.isFinite(n) ? n : 0);
  }

  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
      <input
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={`${INPUT} ${prefix ? 'pl-8' : ''} ${className}`}
      />
    </div>
  );
}

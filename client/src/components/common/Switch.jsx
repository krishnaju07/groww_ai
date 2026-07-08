const SIZES = {
  sm: { track: 'h-5 w-9', thumb: 'h-3.5 w-3.5', translate: 'translate-x-4' },
  md: { track: 'h-6 w-11', thumb: 'h-4 w-4', translate: 'translate-x-5' },
};

/**
 * Generic iOS-style toggle switch. Domain coloring (which state is "safe" vs
 * "danger") is the caller's decision via checkedClass/uncheckedClass.
 * @param {{checked:boolean, onChange:(next:boolean)=>void, disabled?:boolean, size?:'sm'|'md', checkedClass?:string, uncheckedClass?:string, label?:string}} props
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  checkedClass = 'bg-accent/80 border-accent/60',
  uncheckedClass = 'bg-muted/20 border-border/70',
  label,
}) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none ${s.track} ${
        checked ? checkedClass : uncheckedClass
      }`}
    >
      <span
        className={`inline-block transform rounded-full bg-white shadow transition-transform duration-200 ${s.thumb} ${
          checked ? s.translate : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

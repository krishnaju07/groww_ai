import { cx, GLASS_PANEL, LABEL, NUM } from '../../lib/ui';

/**
 * INRInput — glass currency field with a `₹` prefix and inline range validation.
 * Renders a validation message when the value falls outside `[min, max]`.
 *
 * @param {Object} props
 * @param {number} props.value                       Current numeric value.
 * @param {(next:number)=>void} props.onChange       Called with the parsed numeric value.
 * @param {number} [props.min]                        Inclusive lower bound for validation.
 * @param {number} [props.max]                        Inclusive upper bound for validation.
 * @param {string} [props.label]                      Field label.
 * @param {string} [props.error]                      External error message (takes precedence).
 * @param {string} [props.placeholder]                Input placeholder.
 * @returns {JSX.Element}
 */
export default function INRInput({
  value,
  onChange,
  min,
  max,
  label,
  error,
  placeholder,
}) {
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  const numeric = Number(value);
  const isNumber = Number.isFinite(numeric);

  let rangeError = '';
  if (isNumber) {
    if (hasMin && numeric < min) {
      rangeError = `Minimum is ₹${Number(min).toLocaleString('en-IN')}`;
    } else if (hasMax && numeric > max) {
      rangeError = `Maximum is ₹${Number(max).toLocaleString('en-IN')}`;
    }
  }

  const message = error || rangeError;
  const invalid = Boolean(message);

  const handleChange = (e) => {
    const raw = e.target.value;
    // Allow clearing → emit 0; otherwise parse digits/decimal.
    const parsed = raw === '' ? 0 : Number(raw);
    onChange(Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <div className="w-full">
      {label && <label className={cx('mb-1.5 block', LABEL)}>{label}</label>}
      <div
        className={cx(
          'flex items-center px-3.5 transition-all focus-within:ring-2',
          GLASS_PANEL,
          invalid
            ? 'border-danger/50 focus-within:border-danger/50 focus-within:ring-danger/30'
            : 'focus-within:border-accent/40 focus-within:ring-accent/40',
        )}
      >
        <span className="mr-1.5 select-none text-sm font-semibold text-muted">₹</span>
        <input
          type="number"
          inputMode="numeric"
          value={value ?? ''}
          min={hasMin ? min : undefined}
          max={hasMax ? max : undefined}
          placeholder={placeholder}
          onChange={handleChange}
          className={cx(
            'w-full bg-transparent py-2.5 text-sm font-semibold text-text placeholder:font-normal placeholder:text-muted/60 focus:outline-none',
            NUM,
          )}
        />
      </div>
      {invalid && <p className="mt-1.5 text-xs font-medium text-danger">{message}</p>}
    </div>
  );
}

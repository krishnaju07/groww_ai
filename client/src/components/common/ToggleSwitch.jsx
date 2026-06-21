import { cx, GRADIENT_ACCENT } from '../../lib/ui';

/**
 * ToggleSwitch — premium pill switch with an accent glow when ON.
 *
 * @param {Object} props
 * @param {string} [props.label]                Label rendered to the left of the switch.
 * @param {boolean} props.enabled               Current on/off state.
 * @param {(next:boolean)=>void} props.onChange Called with the toggled value.
 * @param {boolean} [props.disabled]            Disables interaction.
 * @returns {JSX.Element}
 */
export default function ToggleSwitch({ label, enabled, onChange, disabled = false }) {
  const handleToggle = () => {
    if (disabled) return;
    onChange(!enabled);
  };

  return (
    <label
      className={cx(
        'flex items-center justify-between gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      {label && <span className="text-sm font-medium text-text">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label || 'toggle'}
        disabled={disabled}
        onClick={handleToggle}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent/50',
          enabled
            ? cx(GRADIENT_ACCENT, 'border-white/10 shadow-glow')
            : 'border-white/10 bg-white/10',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <span
          className="inline-block transform rounded-full bg-white shadow-md transition-transform duration-300"
          style={{
            height: '1.125rem',
            width: '1.125rem',
            transform: enabled ? 'translateX(1.375rem)' : 'translateX(0.25rem)',
          }}
        />
      </button>
    </label>
  );
}

import { Info } from 'lucide-react';
import Tooltip from './Tooltip.jsx';

/**
 * InfoHint — a muted info icon that reveals an explanatory tooltip on
 * hover/focus. Use inline next to labels that need a short explanation.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.text          Explanation shown in the tooltip.
 * @param {'top'|'bottom'} [props.side='top']   Tooltip side.
 * @returns {JSX.Element}
 */
export default function InfoHint({ text, side = 'top' }) {
  return (
    <Tooltip content={text} side={side}>
      <Info
        size={14}
        className="text-muted transition-colors hover:text-text"
        aria-label="More information"
      />
    </Tooltip>
  );
}

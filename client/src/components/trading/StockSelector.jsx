import { ChevronDown } from 'lucide-react';
import { formatINR, formatPercent, pnlColorClass } from '../../lib/format';
import { GLASS_PANEL, LABEL, NUM, cx } from '../../lib/ui';

/**
 * @typedef {import('../../types').StockQuote} StockQuote
 */

/**
 * StockSelector — dropdown to pick a symbol from the live universe.
 * Shows the symbol + name, and (when available) the live price / day change of
 * the currently selected stock beside the control.
 *
 * @param {Object} props
 * @param {StockQuote[]} props.stocks            Live universe quotes.
 * @param {string} props.value                   Currently selected canonical symbol.
 * @param {(symbol:string)=>void} props.onChange Called with the chosen symbol.
 * @returns {JSX.Element}
 */
export default function StockSelector({ stocks, value, onChange }) {
  const rows = Array.isArray(stocks) ? stocks : [];
  const selected = rows.find((s) => s.symbol === value) || null;
  const up = selected ? selected.change >= 0 : true;

  return (
    <div className="w-full">
      <label className={cx(LABEL, 'mb-2 block')}>Stock</label>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={cx(
              GLASS_PANEL,
              'w-full appearance-none px-3.5 py-2.5 pr-10 text-sm font-medium text-text outline-none transition-all',
              'focus:border-accent/40 focus:ring-2 focus:ring-accent/40',
              '[&>option]:bg-surface [&>option]:text-text',
            )}
          >
            {rows.length === 0 && <option value="">No stocks available</option>}
            {rows.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>

        {selected && (
          <div
            className={cx(
              GLASS_PANEL,
              'shrink-0 px-3.5 py-2 text-right',
            )}
          >
            <div className={cx(NUM, 'text-sm font-bold text-text')}>
              {formatINR(selected.price)}
            </div>
            <div
              className={cx(
                NUM,
                'text-xs font-semibold',
                pnlColorClass(selected.change),
              )}
            >
              {up ? '▲' : '▼'} {formatPercent(selected.changePercent)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

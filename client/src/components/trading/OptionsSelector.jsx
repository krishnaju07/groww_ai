import { useEffect, useState } from 'react';
import { optionsService } from '../../services/options.service.js';
import { formatINR } from '../../lib/format.js';

function formatExpiry(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Underlying -> expiry -> strike/CE-PE chain picker. Fires onSelectContract with the
 * exact contract identity (tradingSymbol, strike, expiry, optionType, lotSize, premium)
 * needed to feed the chart/TradePanel and the /orders payload — mirrors StockSelector's
 * flat-pill pattern for underlying/expiry, plus a scrollable strike table for the chain.
 * Every underlying is always browsable/tradeable (there are only 3) — the star toggle
 * is purely about whether the AI background scan/auto-trading cron includes it, same
 * "focus list" concept as StockSelector's add/remove.
 * @param {{selected:object|null, onSelectContract:(contract:object)=>void, focusUnderlyings?:string[], onToggleFocus?:(symbol:string)=>void}} props
 */
export function OptionsSelector({ selected, onSelectContract, focusUnderlyings = [], onToggleFocus }) {
  const [underlyings, setUnderlyings] = useState([]);
  const [underlying, setUnderlying] = useState(null);
  const [expiries, setExpiries] = useState([]);
  const [expiry, setExpiry] = useState(null);
  const [chain, setChain] = useState([]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    optionsService.underlyings().then((list) => {
      setUnderlyings(list);
      if (list.length) setUnderlying(list[0].symbol);
    });
  }, []);

  useEffect(() => {
    if (!underlying) return;
    optionsService.expiries(underlying).then((list) => {
      setExpiries(list);
      setExpiry(list[0] ?? null);
    });
  }, [underlying]);

  useEffect(() => {
    if (!underlying || !expiry) return;
    setLoading(true);
    optionsService
      .chain(underlying, expiry)
      .then(({ chain: c, spotPrice: sp }) => {
        setChain(c);
        setSpotPrice(sp);
      })
      .finally(() => setLoading(false));
  }, [underlying, expiry]);

  const atmStrike = spotPrice != null && chain.length
    ? chain.reduce((closest, row) => (Math.abs(row.strike - spotPrice) < Math.abs(closest - spotPrice) ? row.strike : closest), chain[0].strike)
    : null;

  function pick(row, optionType) {
    const side = optionType === 'CE' ? row.ce : row.pe;
    if (!side) return;
    onSelectContract({
      underlying,
      spotSymbol: underlyings.find((u) => u.symbol === underlying)?.spotSymbol,
      strike: row.strike,
      expiry,
      optionType,
      tradingSymbol: side.tradingSymbol,
      lotSize: side.lotSize,
      premium: side.premium,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {underlyings.map((u) => {
          const isFocused = focusUnderlyings.includes(u.symbol);
          return (
            <div key={u.symbol} className="relative">
              <button
                onClick={() => setUnderlying(u.symbol)}
                className={`shrink-0 rounded-xl border px-4 py-2 pr-7 text-sm font-semibold transition-colors ${
                  underlying === u.symbol
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border/70 bg-surface/50 text-text hover:border-accent/30'
                }`}
              >
                {u.name}
              </button>
              {onToggleFocus && (
                <button
                  onClick={() => onToggleFocus(u.symbol)}
                  title={isFocused ? `${u.symbol} is in your auto-trading focus list` : `Add ${u.symbol} to your auto-trading focus list`}
                  className={`absolute right-1.5 top-1.5 text-sm ${isFocused ? 'text-accent' : 'text-muted/50 hover:text-muted'}`}
                >
                  {isFocused ? '★' : '☆'}
                </button>
              )}
            </div>
          );
        })}
        {spotPrice != null && <span className="self-center text-sm text-muted">Spot: {formatINR(spotPrice)}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {expiries.map((e) => (
          <button
            key={e}
            onClick={() => setExpiry(e)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              expiry === e
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border/70 bg-surface/50 text-muted hover:border-accent/30'
            }`}
          >
            {formatExpiry(e)}
          </button>
        ))}
      </div>

      {loading && <div className="py-4 text-center text-sm text-muted">Loading option chain…</div>}

      {!loading && chain.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="p-2 font-medium">CE</th>
                <th className="p-2 text-center font-medium">Strike</th>
                <th className="p-2 text-right font-medium">PE</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((row) => {
                const isAtm = row.strike === atmStrike;
                return (
                  <tr key={row.strike} className={`border-t border-border/40 ${isAtm ? 'bg-accent/5' : ''}`}>
                    <td className="p-2">
                      <button
                        disabled={!row.ce}
                        onClick={() => pick(row, 'CE')}
                        className={`w-full rounded-lg border px-2 py-1 text-left transition-colors disabled:opacity-40 ${
                          selected?.tradingSymbol === row.ce?.tradingSymbol
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-border/60 hover:border-accent/30'
                        }`}
                      >
                        {row.ce ? formatINR(row.ce.premium ?? 0) : '—'}
                      </button>
                    </td>
                    <td className="p-2 text-center font-semibold">{row.strike}{isAtm && <span className="ml-1 text-xs text-accent">ATM</span>}</td>
                    <td className="p-2">
                      <button
                        disabled={!row.pe}
                        onClick={() => pick(row, 'PE')}
                        className={`w-full rounded-lg border px-2 py-1 text-right transition-colors disabled:opacity-40 ${
                          selected?.tradingSymbol === row.pe?.tradingSymbol
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-border/60 hover:border-accent/30'
                        }`}
                      >
                        {row.pe ? formatINR(row.pe.premium ?? 0) : '—'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !chain.length && underlying && (
        <div className="py-4 text-center text-sm text-muted">No option chain data yet — instrument sync may not have run.</div>
      )}
    </div>
  );
}

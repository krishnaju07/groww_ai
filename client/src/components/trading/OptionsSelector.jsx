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
  const [premiumsUnavailable, setPremiumsUnavailable] = useState(false);
  const [premiumsUnavailableReason, setPremiumsUnavailableReason] = useState(null);
  const [chainIntel, setChainIntel] = useState(null);

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
      .then(({ chain: c, spotPrice: sp, premiumsUnavailable: pu, premiumsUnavailableReason: pur, chainIntel: ci }) => {
        setChain(c);
        setSpotPrice(sp);
        setPremiumsUnavailable(Boolean(pu));
        setPremiumsUnavailableReason(pur ?? null);
        setChainIntel(ci ?? null);
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

      {!loading && premiumsUnavailable && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          Live premiums aren't available right now{premiumsUnavailableReason ? ` (${premiumsUnavailableReason})` : ''} — strike/expiry
          data below is still real, but prices show as "—" rather than a possibly-wrong number. This usually means the
          configured broker doesn't have F&amp;O live-data access.
        </div>
      )}

      {!loading && !premiumsUnavailable && chain.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-bg/30 p-3 text-xs">
          {chainIntel?.available ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span>PCR <span className="font-semibold text-text">{chainIntel.pcr}</span></span>
              <span>Max Pain <span className="font-semibold text-text">{chainIntel.maxPain}</span></span>
              {chainIntel.supportStrike != null && <span>OI Support <span className="font-semibold text-accent">{chainIntel.supportStrike}</span></span>}
              {chainIntel.resistanceStrike != null && <span>OI Resistance <span className="font-semibold text-danger">{chainIntel.resistanceStrike}</span></span>}
              {chainIntel.biasNote && <span className="text-muted">{chainIntel.biasNote}</span>}
            </div>
          ) : (
            <span className="text-muted">{chainIntel?.biasNote ?? 'Chain intelligence (PCR/Max Pain/OI) unavailable — needs a live F&O data feed.'}</span>
          )}
        </div>
      )}

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
                // ITM/OTM is relative to spot, independent of which side actually has liquidity —
                // a call is ITM below spot, a put is ITM above spot.
                const ceItm = spotPrice != null && row.strike < spotPrice;
                const peItm = spotPrice != null && row.strike > spotPrice;
                return (
                  <tr key={row.strike} className={`border-t border-border/40 ${isAtm ? 'bg-accent/5' : ''}`}>
                    <td className={`p-2 ${ceItm ? 'bg-accent/[0.04]' : ''}`}>
                      <button
                        disabled={!row.ce}
                        onClick={() => pick(row, 'CE')}
                        className={`w-full rounded-lg border px-2 py-1 text-left transition-colors disabled:opacity-40 ${
                          selected?.tradingSymbol === row.ce?.tradingSymbol
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-border/60 hover:border-accent/30'
                        }`}
                      >
                        <div>{row.ce?.premium != null ? formatINR(row.ce.premium) : '—'}</div>
                        {row.ce?.greeks && (
                          <div className="text-[10px] text-muted">Δ {row.ce.greeks.delta} · θ {row.ce.greeks.theta}</div>
                        )}
                      </button>
                    </td>
                    <td className="p-2 text-center font-semibold">{row.strike}{isAtm && <span className="ml-1 text-xs text-accent">ATM</span>}</td>
                    <td className={`p-2 ${peItm ? 'bg-danger/[0.04]' : ''}`}>
                      <button
                        disabled={!row.pe}
                        onClick={() => pick(row, 'PE')}
                        className={`w-full rounded-lg border px-2 py-1 text-right transition-colors disabled:opacity-40 ${
                          selected?.tradingSymbol === row.pe?.tradingSymbol
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-border/60 hover:border-accent/30'
                        }`}
                      >
                        <div>{row.pe?.premium != null ? formatINR(row.pe.premium) : '—'}</div>
                        {row.pe?.greeks && (
                          <div className="text-[10px] text-muted">Δ {row.pe.greeks.delta} · θ {row.pe.greeks.theta}</div>
                        )}
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

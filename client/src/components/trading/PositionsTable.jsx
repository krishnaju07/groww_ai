import { useState } from 'react';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { ExitPositionModal } from '../common/ExitPositionModal.jsx';
import { RealMoneyConfirmModal } from '../common/RealMoneyConfirmModal.jsx';
import { BTN_DANGER } from '../../lib/ui.js';
import { ordersService } from '../../services/orders.service.js';
import { toast } from '../../store/useToastStore.js';
import { useSettingsStore } from '../../store/useSettingsStore.js';
import { formatINR, formatPercent } from '../../lib/format.js';

/** @param {{action?:string}|undefined} signal */
function aiViewFor(signal) {
  if (!signal) return null;
  if (signal.action === 'SELL') return { label: 'Consider Exit', tone: 'danger' };
  if (signal.action === 'BUY') return { label: 'Hold / Add', tone: 'accent' };
  return { label: 'Hold', tone: 'default' };
}

/**
 * Market SELL for one open position, full or partial — every click asks "how many"
 * first (defaulting to the full quantity, one tap away), so a position built from
 * several buys never gets silently flattened by a single click.
 * @param {{position:object, onExited?:()=>void}} props
 */
function ExitButton({ position: p, onExited }) {
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const isLive = tradingMode?.mode === 'live' && tradingMode?.liveAvailable;
  const [submitting, setSubmitting] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [pendingQuantity, setPendingQuantity] = useState(null);

  async function submit(quantity, confirmRealMoney) {
    setSubmitting(true);
    try {
      await ordersService.place({
        symbol: p.symbol,
        action: 'SELL',
        quantity,
        triggerReason: 'manual exit',
        confirmRealMoney,
        segment: p.segment,
      });
      toast.success(`Exited ${quantity} ${p.symbol}${confirmRealMoney ? ' — REAL MONEY' : ''}`);
      onExited?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
      setPendingQuantity(null);
    }
  }

  function handleQuantityConfirmed(quantity) {
    setShowQuantityModal(false);
    if (isLive) setPendingQuantity(quantity);
    else submit(quantity, false);
  }

  return (
    <>
      <button
        onClick={() => setShowQuantityModal(true)}
        disabled={submitting}
        className={`${BTN_DANGER} px-3 py-1.5 text-xs`}
      >
        {submitting ? <Spinner className="h-3.5 w-3.5" /> : 'Exit'}
      </button>
      {showQuantityModal && (
        <ExitPositionModal position={p} onConfirm={handleQuantityConfirmed} onCancel={() => setShowQuantityModal(false)} />
      )}
      {pendingQuantity != null && (
        <RealMoneyConfirmModal
          action="SELL"
          symbol={p.symbol}
          quantity={pendingQuantity}
          estimatedValue={(p.ltp || 0) * pendingQuantity}
          onConfirm={() => submit(pendingQuantity, true)}
          onCancel={() => setPendingQuantity(null)}
        />
      )}
    </>
  );
}

/** @param {{positions?:object[], signals?:Record<string,{action:string,confidence:number}>, onExited?:()=>void}} props */
export function PositionsTable({ positions = [], signals = {}, onExited }) {
  return (
    <Card>
      <div className="mb-3 font-display font-semibold">Open Positions</div>
      {!positions.length && <div className="py-6 text-center text-sm text-muted">No open positions.</div>}
      {positions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Avg Price</th>
                <th className="pb-2 font-medium">Invested</th>
                <th className="pb-2 font-medium">LTP</th>
                <th className="pb-2 font-medium">Current Value</th>
                <th className="pb-2 font-medium">P&amp;L</th>
                <th className="pb-2 font-medium">AI View</th>
                <th className="pb-2 font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const aiView = aiViewFor(signals[p.symbol]);
                return (
                  <tr key={p.symbol} className="border-t border-border/50">
                    <td className="py-2 font-medium">
                      {p.symbol}
                      {p.segment === 'FNO' && (
                        <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent">
                          {p.strike} {p.optionType}
                        </span>
                      )}
                    </td>
                    <td className="py-2">{p.quantity}</td>
                    <td className="py-2">{formatINR(p.avgBuyPrice)}</td>
                    <td className="py-2 text-muted">{formatINR(p.investedAmount)}</td>
                    <td className="py-2">{formatINR(p.ltp)}</td>
                    <td className="py-2 text-muted">{formatINR(p.currentValue)}</td>
                    <td className={`py-2 ${p.pnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {formatINR(p.pnl)} ({formatPercent(p.pnlPercent)})
                    </td>
                    <td className="py-2">{aiView ? <Badge tone={aiView.tone}>{aiView.label}</Badge> : <span className="text-muted">—</span>}</td>
                    <td className="py-2 text-right">
                      <ExitButton position={p} onExited={onExited} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

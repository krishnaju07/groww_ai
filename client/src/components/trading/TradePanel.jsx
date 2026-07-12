import { useState, useEffect } from 'react';
import { Card } from '../common/Card.jsx';
import { INRInput } from '../common/INRInput.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { RealMoneyConfirmModal } from '../common/RealMoneyConfirmModal.jsx';
import { BTN_PRIMARY, BTN_DANGER, INPUT } from '../../lib/ui.js';
import { ordersService } from '../../services/orders.service.js';
import { toast } from '../../store/useToastStore.js';
import { useSettingsStore } from '../../store/useSettingsStore.js';

/**
 * @param {{symbol:string, ltp:number, decision:object|null, onOrderPlaced:()=>void, segment?:'CASH'|'FNO', lotSize?:number|null}} props
 */
export function TradePanel({ symbol, ltp, decision, onOrderPlaced, segment = 'CASH', lotSize = null }) {
  const isOptions = segment === 'FNO';
  const defaultQty = isOptions && lotSize ? lotSize : 1;
  const [action, setAction] = useState('BUY');
  const [quantity, setQuantity] = useState(defaultQty);
  const [stopLoss, setStopLoss] = useState(0);
  const [target, setTarget] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const isLive = tradingMode?.mode === 'live' && tradingMode?.liveAvailable;

  // Reset price-tied fields whenever the symbol changes — otherwise a stop-loss/target
  // computed for the previous (differently-priced) symbol silently carries over.
  useEffect(() => {
    setQuantity(defaultQty);
    setStopLoss(0);
    setTarget(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (decision && decision.action !== 'WAIT') {
      setAction(decision.action);
      setQuantity(decision.quantity || 1);
      setStopLoss(decision.stopLoss || 0);
      setTarget(decision.target || 0);
    }
  }, [decision]);

  const estimatedValue = (ltp || 0) * quantity;

  // Quick-pick quantity presets — lots for options (1/2/5/10 lots), ₹ tiers for equity
  // (converted to share count via LTP, rounded down so a preset never overshoots).
  const qtyPresets = isOptions && lotSize
    ? [1, 2, 5, 10].map((lots) => ({ label: `${lots} lot${lots > 1 ? 's' : ''}`, quantity: lots * lotSize }))
    : ltp > 0
      ? [500, 1000, 2000, 5000]
          .map((inr) => ({ label: `₹${inr}`, quantity: Math.max(1, Math.floor(inr / ltp)) }))
          .filter((p, i, arr) => i === 0 || p.quantity !== arr[i - 1].quantity) // dedupe when LTP is high enough that tiers collapse to the same share count
      : [];

  function handleSubmitClick() {
    if (isLive) {
      setShowConfirm(true);
    } else {
      submit(false);
    }
  }

  async function submit(confirmRealMoney) {
    setSubmitting(true);
    try {
      await ordersService.place({
        symbol,
        action,
        quantity,
        stopLoss: stopLoss || undefined,
        target: target || undefined,
        triggerReason: decision && decision.action === action ? decision.reason : 'manual',
        aiDecisionId: decision && decision.action === action ? decision.decisionId : undefined,
        confirmRealMoney,
        segment,
      });
      toast.success(`${action} ${quantity} ${symbol} placed${confirmRealMoney ? ' — REAL MONEY' : ''}`);
      onOrderPlaced?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 font-display font-semibold">Place Order ({isLive ? 'LIVE' : 'Paper'})</div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {['BUY', 'SELL'].map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            className={`rounded-xl border py-2.5 font-semibold transition-colors ${
              action === a
                ? a === 'BUY'
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-danger/50 bg-danger/10 text-danger'
                : 'border-border/70 text-muted hover:border-border'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Quantity{isOptions && lotSize ? ` (lot size ${lotSize})` : ''}
          </label>
          <input
            type="number"
            min={isOptions && lotSize ? lotSize : 1}
            step={isOptions && lotSize ? lotSize : 1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={INPUT}
          />
          {isOptions && lotSize && quantity % lotSize !== 0 && (
            <div className="mt-1 text-xs text-danger">Must be a multiple of the lot size ({lotSize}).</div>
          )}
          {qtyPresets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {qtyPresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setQuantity(p.quantity)}
                  className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                    quantity === p.quantity ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/60 text-muted hover:border-border'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Stop Loss</label>
            <INRInput value={stopLoss} onChange={setStopLoss} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Target</label>
            <INRInput value={target} onChange={setTarget} />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-bg/30 p-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>LTP</span>
            <span>₹{ltp?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="mt-1 flex justify-between font-medium">
            <span>Est. value</span>
            <span>₹{estimatedValue.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={handleSubmitClick}
          disabled={submitting || !ltp}
          className={`w-full ${action === 'BUY' ? BTN_PRIMARY : BTN_DANGER}`}
        >
          {submitting ? <Spinner className="h-4 w-4" /> : isLive ? `${action} ${symbol} — REAL MONEY` : `${action} ${symbol}`}
        </button>
      </div>

      {showConfirm && (
        <RealMoneyConfirmModal
          action={action}
          symbol={symbol}
          quantity={quantity}
          estimatedValue={estimatedValue}
          onConfirm={() => submit(true)}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </Card>
  );
}

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
 * @param {{symbol:string, ltp:number, decision:object|null, onOrderPlaced:()=>void}} props
 */
export function TradePanel({ symbol, ltp, decision, onOrderPlaced }) {
  const [action, setAction] = useState('BUY');
  const [quantity, setQuantity] = useState(1);
  const [stopLoss, setStopLoss] = useState(0);
  const [target, setTarget] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const isLive = tradingMode?.mode === 'live' && tradingMode?.liveAvailable;

  // Reset price-tied fields whenever the symbol changes — otherwise a stop-loss/target
  // computed for the previous (differently-priced) symbol silently carries over.
  useEffect(() => {
    setQuantity(1);
    setStopLoss(0);
    setTarget(0);
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
          <label className="mb-1 block text-xs font-medium text-muted">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={INPUT}
          />
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

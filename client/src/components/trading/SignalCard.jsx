import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { ConfidenceMeter } from '../common/ConfidenceMeter.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { BTN_PRIMARY } from '../../lib/ui.js';
import { formatINR } from '../../lib/format.js';

const TONE = { BUY: 'accent', SELL: 'danger', WAIT: 'default' };

/**
 * @param {{symbol:string, decision:object|null, loading:boolean, onAskAI:()=>void}} props
 */
export function SignalCard({ symbol, decision, loading, onAskAI }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display font-semibold">AI Signal — {symbol}</span>
        <button onClick={onAskAI} disabled={loading} className={`${BTN_PRIMARY} px-3 py-1.5 text-sm`}>
          {loading ? <Spinner className="h-4 w-4 text-bg" /> : 'Ask AI'}
        </button>
      </div>

      {!decision && !loading && <div className="py-6 text-center text-sm text-muted">Click "Ask AI" for a fresh read on {symbol}.</div>}

      {decision && (
        <div className="flex items-start gap-4">
          <ConfidenceMeter value={decision.confidence} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={TONE[decision.action]}>{decision.action}</Badge>
              {decision.action !== 'WAIT' && <span className="text-sm text-muted">{decision.quantity} shares</span>}
            </div>
            {decision.action !== 'WAIT' && (
              <div className="flex gap-4 text-sm">
                <span className="text-danger">SL: {formatINR(decision.stopLoss)}</span>
                <span className="text-accent">Target: {formatINR(decision.target)}</span>
              </div>
            )}
            <p className="text-sm text-muted">{decision.reason}</p>
            {decision.models?.length > 1 && (
              <div className="flex gap-2 text-xs text-muted">
                {decision.models.map((m) => (
                  <span key={m.name} className="rounded-full border border-border/60 px-2 py-0.5">
                    {m.name}: {m.action} ({m.confidence}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

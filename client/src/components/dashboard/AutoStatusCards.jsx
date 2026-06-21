import { Bot, ShieldCheck } from 'lucide-react';
import { GLASS_CARD, PILL, LABEL, cx } from '../../lib/ui';
import { formatINR, formatDateTime } from '../../lib/format';

/**
 * Status pill for an Auto* engine (glows on, muted off).
 * @param {Object} props
 * @param {boolean} props.enabled
 * @returns {JSX.Element}
 */
function StatusPill({ enabled }) {
  return (
    <span
      className={cx(
        PILL,
        enabled
          ? 'border border-accent/30 bg-accent/12 text-accent'
          : 'border border-white/10 bg-white/5 text-muted',
      )}
    >
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          enabled ? 'bg-accent animate-glow-pulse' : 'bg-muted',
        )}
      />
      {enabled ? 'ON' : 'OFF'}
    </span>
  );
}

/**
 * Two status cards summarising the auto-invest and auto-exit engines.
 * ON-state cards glow with an accent ring + shadow-glow.
 * @param {Object} props
 * @param {{ enabled: boolean, lastTrade?: { symbol: string, investmentAmount: number, at: string } }} props.autoInvest
 * @param {{ enabled: boolean, activeRules: number }} props.autoExit
 * @returns {JSX.Element}
 */
export default function AutoStatusCards({ autoInvest, autoExit }) {
  const ai = autoInvest || { enabled: false };
  const ax = autoExit || { enabled: false, activeRules: 0 };
  const rules = ax.activeRules ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div
        className={cx(
          GLASS_CARD,
          'p-5 transition-all duration-300',
          ai.enabled && 'border-accent/30 ring-1 ring-accent/25 shadow-glow',
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={cx(
                'flex h-9 w-9 items-center justify-center rounded-xl',
                ai.enabled
                  ? 'bg-accent/15 text-accent shadow-[0_0_18px_-4px_rgba(0,200,83,0.5)]'
                  : 'bg-white/5 text-muted',
              )}
            >
              <Bot size={18} />
            </span>
            <span className="font-display font-semibold text-text">Auto Invest</span>
          </div>
          <StatusPill enabled={ai.enabled} />
        </div>
        <div className="mt-4">
          <p className={LABEL}>Last Trade</p>
          {ai.lastTrade ? (
            <div className="mt-1.5">
              <p className="text-sm text-text">
                <span className="font-display font-semibold">{ai.lastTrade.symbol}</span>{' '}
                <span className="num text-accent">{formatINR(ai.lastTrade.investmentAmount)}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{formatDateTime(ai.lastTrade.at)}</p>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted">No automatic buys yet.</p>
          )}
        </div>
      </div>

      <div
        className={cx(
          GLASS_CARD,
          'p-5 transition-all duration-300',
          ax.enabled && 'border-accent/30 ring-1 ring-accent/25 shadow-glow',
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={cx(
                'flex h-9 w-9 items-center justify-center rounded-xl',
                ax.enabled
                  ? 'bg-accent/15 text-accent shadow-[0_0_18px_-4px_rgba(0,200,83,0.5)]'
                  : 'bg-white/5 text-muted',
              )}
            >
              <ShieldCheck size={18} />
            </span>
            <span className="font-display font-semibold text-text">Auto Exit</span>
          </div>
          <StatusPill enabled={ax.enabled} />
        </div>
        <div className="mt-4">
          <p className={LABEL}>Active Rules</p>
          <p className="mt-1.5 text-sm text-text">
            <span className="num font-display text-lg font-bold text-text">{rules}</span>{' '}
            <span className="text-muted">
              exit rule{rules === 1 ? '' : 's'} guarding open positions.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

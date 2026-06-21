import { useEffect, useRef } from 'react';
import * as tradesService from '../services/trades.service.js';
import { formatINR } from '../lib/format.js';
import { toast } from '../store/useToastStore.js';

/**
 * How often to poll for newly executed automatic trades.
 */
const POLL_MS = 20000;

/**
 * Watch the backend for newly executed automatic (auto-invest / auto-exit)
 * trades and surface each genuinely-new one as an `auto` toast.
 *
 * Behavior:
 *  - Polls `tradesService.getTrades({ type:'automatic', limit:5 })` every ~20s.
 *  - On the FIRST successful fetch it seeds the latest-seen id WITHOUT toasting,
 *    so historical trades never spam the user on page load.
 *  - Thereafter, any trade whose id we haven't seen fires a single toast.
 *  - Never throws — all work is wrapped in try/catch.
 *
 * Mounted once (in Layout). Returns nothing.
 */
export function useAutoTradeToasts() {
  // Tracks the most-recent trade id we have already accounted for.
  const lastSeenIdRef = useRef(null);
  // Whether we've completed the initial seed fetch.
  const seededRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const trades = await tradesService.getTrades({ type: 'automatic', limit: 5 });
        if (cancelled || !Array.isArray(trades) || trades.length === 0) {
          // Still mark as seeded so an initially-empty history doesn't replay later.
          if (!cancelled) seededRef.current = true;
          return;
        }

        // Trades arrive newest-first; the head is the latest.
        const latest = trades[0];

        // First fetch: seed without toasting any historical trades.
        if (!seededRef.current) {
          seededRef.current = true;
          lastSeenIdRef.current = latest.id;
          return;
        }

        // Collect every trade newer than the last-seen one (newest-first order),
        // then toast oldest→newest so they stack in chronological order.
        const fresh = [];
        for (const t of trades) {
          if (t.id === lastSeenIdRef.current) break;
          fresh.push(t);
        }
        lastSeenIdRef.current = latest.id;

        for (const t of fresh.reverse()) {
          toast.auto(
            `Auto ${t.action} ${t.symbol}`,
            `${t.quantity} @ ${formatINR(t.price)}`,
          );
        }
      } catch {
        // Swallow — polling must never throw or surface errors to the user.
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}

export default useAutoTradeToasts;

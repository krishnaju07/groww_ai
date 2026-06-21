import { useCallback } from 'react';
import useSignalsStore from '../store/useSignalsStore.js';
import { usePolling } from './usePolling.js';

/**
 * Convenience hook over the signals store. Polls the top-signals list on an
 * interval (default 10s) and exposes a `loadSignal(symbol)` helper plus the
 * per-symbol signals map.
 *
 * @param {number} [intervalMs=10000] polling interval in milliseconds
 * @returns {{
 *   top: import('../types.js').AISignal[],
 *   signals: Record<string, import('../types.js').AISignal>,
 *   loading: boolean,
 *   loadSignal: (symbol: string) => Promise<import('../types.js').AISignal|undefined>,
 *   refreshTop: () => Promise<void>,
 * }}
 */
export function useSignals(intervalMs = 10000) {
  const top = useSignalsStore((s) => s.top);
  const signals = useSignalsStore((s) => s.signals);
  const loading = useSignalsStore((s) => s.loading);
  const fetchTop = useSignalsStore((s) => s.fetchTop);
  const fetchSignal = useSignalsStore((s) => s.fetchSignal);

  usePolling(fetchTop, intervalMs);

  const loadSignal = useCallback((symbol) => fetchSignal(symbol), [fetchSignal]);
  const refreshTop = useCallback(() => fetchTop(), [fetchTop]);

  return { top, signals, loading, loadSignal, refreshTop };
}

export default useSignals;

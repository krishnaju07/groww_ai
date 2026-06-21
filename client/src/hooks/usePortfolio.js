import { useCallback } from 'react';
import usePortfolioStore from '../store/usePortfolioStore.js';
import { usePolling } from './usePolling.js';

/**
 * Convenience hook: subscribes to the portfolio store and polls it on an
 * interval (default 10s per §12). Returns the current portfolio slice plus a
 * `refresh` callback for manual refetches (e.g. after a trade).
 *
 * @param {number} [intervalMs=10000] polling interval in milliseconds
 * @returns {{
 *   summary: import('../types.js').PortfolioSummary|null,
 *   positions: import('../types.js').Position[],
 *   loading: boolean,
 *   error: string|null,
 *   refresh: () => Promise<void>,
 * }}
 */
export function usePortfolio(intervalMs = 10000) {
  const summary = usePortfolioStore((s) => s.summary);
  const positions = usePortfolioStore((s) => s.positions);
  const loading = usePortfolioStore((s) => s.loading);
  const error = usePortfolioStore((s) => s.error);
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio);

  usePolling(fetchPortfolio, intervalMs);

  const refresh = useCallback(() => fetchPortfolio(), [fetchPortfolio]);

  return { summary, positions, loading, error, refresh };
}

export default usePortfolio;

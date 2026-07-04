import { useEffect } from 'react';

/**
 * Calls `fn` immediately, then every `intervalMs`. `fn` should be a stable
 * store-bound async function (fetch methods dedupe in-flight calls themselves).
 * @param {() => void|Promise<void>} fn
 * @param {number} intervalMs
 */
export function usePolling(fn, intervalMs) {
  useEffect(() => {
    fn();
    const id = setInterval(fn, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}

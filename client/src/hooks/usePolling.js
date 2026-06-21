import { useEffect, useRef } from 'react';

/**
 * Run `fn` once on mount (and whenever `deps` change), then repeatedly every
 * `intervalMs` milliseconds. The interval is cleared on unmount / dep change.
 *
 * The latest `fn` is always invoked via a ref so callers may pass an inline
 * closure without resetting the interval on every render.
 *
 * @param {() => (void | Promise<void>)} fn function to invoke each tick
 * @param {number} intervalMs polling interval in milliseconds
 * @param {ReadonlyArray<unknown>} [deps=[]] re-create the interval when these change
 */
export function usePolling(fn, intervalMs, deps = []) {
  const savedFn = useRef(fn);

  useEffect(() => {
    savedFn.current = fn;
  }, [fn]);

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      savedFn.current();
    };

    // Fire immediately, then on each interval.
    tick();
    const id = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}

export default usePolling;

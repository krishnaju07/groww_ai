import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 * SSR-safe (returns false when `window`/`matchMedia` is unavailable) and updates
 * live as the viewport changes.
 *
 * @param {string} query A media query string, e.g. '(max-width: 767px)'.
 * @returns {boolean} Whether the query currently matches.
 */
export function useMediaQuery(query) {
  const getMatch = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);

    // Sync immediately in case the query changed between render and effect.
    setMatches(mql.matches);

    // addEventListener is the modern API; fall back to addListener for Safari < 14.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/**
 * Convenience hook: true on mobile-width viewports (≤ 767px).
 * @returns {boolean}
 */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

export default useMediaQuery;

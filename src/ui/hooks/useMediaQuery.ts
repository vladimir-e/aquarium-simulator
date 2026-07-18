import { useEffect, useState } from 'react';

/** Below Tailwind's `sm` breakpoint (640px) — the mobile instrument layout. */
export const MOBILE_QUERY = '(max-width: 639.98px)';

function matchesQuery(query: string): boolean {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query).matches : false;
}

/** Live boolean for a media query; resolves synchronously on first render. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesQuery(query));

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return;
    const mql = globalThis.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return (): void => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

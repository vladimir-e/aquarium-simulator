import { useEffect, useState } from 'react';

/** The one layout breakpoint: below Tailwind's `md` the rail folds into the tab
 * bar, the drawer becomes a sheet, and every section that adapts adapts here. */
const MOBILE_QUERY = '(max-width: 767.98px)';

function matchesQuery(query: string): boolean {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query).matches : false;
}

/** Live boolean for a media query; resolves synchronously on first render. */
function useMediaQuery(query: string): boolean {
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

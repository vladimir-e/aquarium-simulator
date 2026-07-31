/**
 * happy-dom ships no `matchMedia`, so every test that renders a responsive
 * component has to stand one up. Queries are answered individually and the
 * lists stay live, so a test can flip a breakpoint mid-render the way a real
 * resize does.
 */

type MediaQueryList = ReturnType<typeof globalThis.matchMedia>;
type Answer = boolean | ((query: string) => boolean);

export interface MatchMediaStub {
  /** Re-answer every query and notify anything listening. */
  set: (matches: Answer) => void;
  restore: () => void;
}

function toPredicate(matches: Answer): (query: string) => boolean {
  return typeof matches === 'function' ? matches : (): boolean => matches;
}

/**
 * Answers width queries against one viewport, and nothing else — so a test
 * names a width and the app's own breakpoint decides, rather than the test
 * picking a side for it.
 */
export function viewport(width: number): (query: string) => boolean {
  return (query: string): boolean => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    if (min) return width >= Number(min[1]);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    if (max) return width <= Number(max[1]);
    return false;
  };
}

export function stubMatchMedia(matches: Answer): MatchMediaStub {
  const original = globalThis.matchMedia;
  const lists = new Map<string, { list: MediaQueryList; listeners: Set<() => void> }>();
  let answer = toPredicate(matches);

  globalThis.matchMedia = ((query: string): MediaQueryList => {
    const cached = lists.get(query);
    if (cached) return cached.list;

    const listeners = new Set<() => void>();
    const list = {
      matches: answer(query),
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: () => void): void => void listeners.add(fn),
      removeEventListener: (_: string, fn: () => void): void => void listeners.delete(fn),
      addListener: (fn: () => void): void => void listeners.add(fn),
      removeListener: (fn: () => void): void => void listeners.delete(fn),
      dispatchEvent: (): boolean => false,
    } as unknown as MediaQueryList;

    lists.set(query, { list, listeners });
    return list;
  }) as typeof globalThis.matchMedia;

  return {
    set: (next: Answer): void => {
      answer = toPredicate(next);
      for (const [query, { list, listeners }] of lists) {
        (list as { matches: boolean }).matches = answer(query);
        for (const fn of listeners) fn();
      }
    },
    restore: (): void => {
      globalThis.matchMedia = original;
    },
  };
}

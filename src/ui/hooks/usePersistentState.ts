import { useCallback, useState } from 'react';

const KEY_PREFIX = 'aqsim.ui.';

function readValue<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage.getItem(KEY_PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeValue<T>(key: string, value: T): void {
  try {
    globalThis.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota) — state stays in-memory only.
  }
}

type SetState<T> = (next: T | ((prev: T) => T)) => void;

/**
 * useState whose value is mirrored to localStorage under a namespaced key, so it
 * survives component remounts (mode switches unmount the mode) and reloads.
 * Reads lazily on mount; writes on every update. Falls back to in-memory on any
 * storage failure.
 */
export function usePersistentState<T>(key: string, initial: T): [T, SetState<T>] {
  const [value, setValue] = useState<T>(() => readValue(key, initial));

  const set = useCallback<SetState<T>>(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        writeValue(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}

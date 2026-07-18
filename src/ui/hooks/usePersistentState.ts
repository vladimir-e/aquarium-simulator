import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

const KEY_PREFIX = 'aqsim.ui.';

function readValue<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage.getItem(KEY_PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * useState whose value is mirrored to localStorage under a namespaced key, so it
 * survives component remounts (mode switches unmount the mode) and reloads.
 * Reads lazily on mount; the write is an effect (pure updater, StrictMode-safe).
 * Falls back to in-memory on any storage failure.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readValue(key, initial));

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, quota) — state stays in-memory only.
    }
  }, [key, value]);

  return [value, setValue];
}

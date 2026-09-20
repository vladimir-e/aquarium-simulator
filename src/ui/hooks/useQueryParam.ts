import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * One query parameter as state, the rest of the query left where it is — a
 * picker opened from the palette must not take the spine's parked tick with it.
 */
export function useQueryParam<T extends string>(
  key: string
): [string | null, (value: T | null) => void] {
  const [params, setParams] = useSearchParams();

  const set = useCallback(
    (value: T | null) => {
      const query = new globalThis.URLSearchParams(params);
      if (value === null) query.delete(key);
      else query.set(key, value);
      setParams(query, { replace: true });
    },
    [key, params, setParams]
  );

  return [params.get(key), set];
}

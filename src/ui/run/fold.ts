/** The folds the run layer groups and averages by. */

/** Items grouped by a key, each group and the groups in the order first seen. */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): T[][] {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const existing = groups.get(key(item));
    if (existing) existing.push(item);
    else groups.set(key(item), [item]);
  }
  return [...groups.values()];
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

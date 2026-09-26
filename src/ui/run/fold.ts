/** The folds the run layer groups, averages and numbers by. */

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

/** The order the tank drew an id in: the order its organisms were stocked, planted, born and budded. */
function drawOrder(id: string): number {
  return parseInt(id.slice(id.indexOf('_') + 1), 36);
}

/** Ids numbered from 1 in the order the tank drew them — how a reader counts what stands. */
export function numbered(ids: Iterable<string>): Map<string, number> {
  const sorted = [...ids].sort((a, b) => drawOrder(a) - drawOrder(b));
  return new Map(sorted.map((id, i) => [id, i + 1]));
}

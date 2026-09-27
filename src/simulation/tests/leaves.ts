/** Every leaf under a value, as its dotted path and what it holds. */
export function leaves<Leaf = unknown>(value: object, prefix = ''): [string, Leaf][] {
  return Object.entries(value).flatMap(([key, child]): [string, Leaf][] => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? leaves<Leaf>(child, path) : [[path, child as Leaf]];
  });
}

/** The paths under a value that hold a number off the number line. */
export function nonFinitePaths(value: object): string[] {
  return leaves(value).flatMap(([path, leaf]) => (typeof leaf === 'number' && !Number.isFinite(leaf) ? [path] : []));
}

export type SnakeCase<S extends string> = S extends `${infer C}${infer Rest}`
  ? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${SnakeCase<Rest>}`
  : S;

/** An engine name as the CLI spells its columns and readings: `greenWater` → `green_water`. */
export function snakeCase<S extends string>(name: S): SnakeCase<S> {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) as SnakeCase<S>;
}

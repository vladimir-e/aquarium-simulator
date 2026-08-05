/** Monotonic sequence guaranteeing unique ids even within one tick. */
let seq = 0;

/** Process-unique id under `prefix` (time prefix + counter). */
export function sequentialId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

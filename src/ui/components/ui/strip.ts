/**
 * Where a reading sits relative to the span the engine is happy with. `ink` is
 * silence — inside the band, or a reading with no band to be outside of.
 */
export type StripTone = 'ink' | 'warn' | 'alert';

/** The lit span, in track fractions. */
export interface StripBand {
  from: number;
  to: number;
}

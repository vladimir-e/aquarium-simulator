/**
 * Transport speed presets. Speed is session-scoped (not persisted today);
 * `normalizeSpeed` guards the boundary so a stored or legacy value can be
 * coerced safely if a future unit ever restores one.
 */

export type SpeedPreset = '1h' | '6h' | '1d';

export const SPEED_PRESETS: readonly SpeedPreset[] = ['1h', '6h', '1d'];

export const DEFAULT_SPEED: SpeedPreset = '1h';

/** Ticks (simulated hours) advanced per real second at each speed. */
export const SPEED_TICKS_PER_SECOND: Record<SpeedPreset, number> = {
  '1h': 1,
  '6h': 6,
  '1d': 24,
};

/** Label shown on the transport segmented control. */
export const SPEED_LABELS: Record<SpeedPreset, string> = {
  '1h': '1h/s',
  '6h': '6h',
  '1d': '1d',
};

/** How far the Step button advances at each speed (one autoplay tick's worth). */
export const STEP_LABELS: Record<SpeedPreset, string> = {
  '1h': '1h',
  '6h': '6h',
  '1d': '1d',
};

/**
 * The retired {1,6,12,24} tick/s set maps onto today's {1,6,24}. The dropped
 * 12 tier resolves to the nearest slower speed so migration never silently
 * runs the sim faster than the value implied.
 */
const LEGACY_KEYS: Record<string, SpeedPreset> = {
  '1hr': '1h',
  '6hr': '6h',
  '12hr': '6h',
  '1day': '1d',
};

const LEGACY_MULTIPLIERS: Record<number, SpeedPreset> = {
  1: '1h',
  6: '6h',
  12: '6h',
  24: '1d',
};

function isSpeedPreset(value: string): value is SpeedPreset {
  return (SPEED_PRESETS as readonly string[]).includes(value);
}

/**
 * Coerce any value that might carry a speed — a current key, a retired legacy
 * key, or a raw tick multiplier — to a valid SpeedPreset. Unknown input
 * resolves to DEFAULT_SPEED.
 */
export function normalizeSpeed(value: unknown): SpeedPreset {
  if (typeof value === 'string') {
    if (isSpeedPreset(value)) return value;
    if (value in LEGACY_KEYS) return LEGACY_KEYS[value];
  }
  if (typeof value === 'number' && value in LEGACY_MULTIPLIERS) {
    return LEGACY_MULTIPLIERS[value];
  }
  return DEFAULT_SPEED;
}

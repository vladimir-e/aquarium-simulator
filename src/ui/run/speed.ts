/**
 * Transport speed presets. Speed is session-scoped, not persisted.
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

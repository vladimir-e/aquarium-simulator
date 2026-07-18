import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SPEED,
  SPEED_PRESETS,
  SPEED_TICKS_PER_SECOND,
  SPEED_LABELS,
  STEP_LABELS,
} from './speed';

describe('speed presets', () => {
  it('exposes the three current tiers', () => {
    expect(SPEED_PRESETS).toEqual(['1h', '6h', '1d']);
  });

  it('maps each preset to its tick multiplier', () => {
    expect(SPEED_TICKS_PER_SECOND).toEqual({ '1h': 1, '6h': 6, '1d': 24 });
  });

  it('labels every preset for the speed and step controls', () => {
    for (const preset of SPEED_PRESETS) {
      expect(SPEED_LABELS[preset]).toBeTruthy();
      expect(STEP_LABELS[preset]).toBeTruthy();
    }
  });

  it('defaults to the slowest tier', () => {
    expect(DEFAULT_SPEED).toBe('1h');
  });
});

import { describe, it, expect } from 'vitest';
import {
  satiationContribution,
  classifySatiationBand,
  classifySatiationBandPosition,
} from './satiation.js';
import { livestockDefaults } from '../config/livestock.js';

const cfg = livestockDefaults;
const {
  satiationOverfedFloor: overfed,
  satiationWellFedFloor: wellFed,
  satiationHungryCeiling: hungry,
  satiationStarvingCeiling: starving,
} = cfg;
const wellFedMid = (overfed + wellFed) / 2;

describe('satiationContribution', () => {
  it.each<[string, number, 'stressor' | 'benefit', number]>([
    ['overfed peak', 100, 'stressor', cfg.satiationOverfedSeverity],
    ['overfed midpoint', (overfed + 100) / 2, 'stressor', cfg.satiationOverfedSeverity / 2],
    ['well-fed peak', wellFedMid, 'benefit', cfg.satiationWellFedPeak],
    ['well-fed lower midpoint', (wellFed + wellFedMid) / 2, 'benefit', cfg.satiationWellFedPeak / 2],
    ['well-fed upper midpoint', (wellFedMid + overfed) / 2, 'benefit', cfg.satiationWellFedPeak / 2],
    ['peckish', (hungry + wellFed) / 2, 'stressor', 0],
    ['hungry midpoint', (starving + hungry) / 2, 'stressor', cfg.satiationHungrySeverity / 2],
    ['starving ceiling', starving, 'stressor', cfg.satiationHungrySeverity],
    [
      'starving midpoint',
      starving / 2,
      'stressor',
      (cfg.satiationHungrySeverity + cfg.satiationStarvingSeverity) / 2,
    ],
    ['empty', 0, 'stressor', cfg.satiationStarvingSeverity],
  ])('interpolates linearly: %s', (_, satiation, channel, expected) => {
    const c = satiationContribution(satiation, cfg);
    expect(c[channel]).toBeCloseTo(expected, 10);
  });

  it('crosses zero at the overfed, well-fed and hungry edges', () => {
    for (const edge of [overfed, wellFed, hungry]) {
      const c = satiationContribution(edge, cfg);
      expect(c.stressor).toBe(0);
      expect(c.benefit).toBe(0);
    }
  });

  it('is continuous across the starving ceiling', () => {
    const above = satiationContribution(starving + 1e-9, cfg);
    const below = satiationContribution(starving - 1e-9, cfg);
    expect(Math.abs(above.stressor - below.stressor)).toBeLessThan(1e-6);
  });

  it('never charges and pays at once', () => {
    for (let s = 0; s <= 100; s += 0.5) {
      const c = satiationContribution(s, cfg);
      expect(c.stressor > 0 && c.benefit > 0).toBe(false);
    }
  });

  it('clamps outside [0, 100] to the end severities', () => {
    expect(satiationContribution(150, cfg).stressor).toBeCloseTo(cfg.satiationOverfedSeverity, 10);
    expect(satiationContribution(-5, cfg).stressor).toBeCloseTo(cfg.satiationStarvingSeverity, 10);
  });
});

describe('classifySatiationBand', () => {
  it('puts each band’s floor inside it and just under it in the next band down', () => {
    expect(classifySatiationBand(100, cfg)).toBe('overfed');
    expect(classifySatiationBand(overfed, cfg)).toBe('overfed');
    expect(classifySatiationBand(overfed - 0.001, cfg)).toBe('wellFed');
    expect(classifySatiationBand(wellFed, cfg)).toBe('wellFed');
    expect(classifySatiationBand(wellFed - 0.001, cfg)).toBe('peckish');
    expect(classifySatiationBand(hungry, cfg)).toBe('peckish');
    expect(classifySatiationBand(hungry - 0.001, cfg)).toBe('hungry');
    expect(classifySatiationBand(starving, cfg)).toBe('hungry');
    expect(classifySatiationBand(starving - 0.001, cfg)).toBe('starving');
    expect(classifySatiationBand(0, cfg)).toBe('starving');
  });

  it('agrees with the band satiationContribution reports', () => {
    for (let s = 0; s <= 100; s += 0.5) {
      expect(satiationContribution(s, cfg).band).toBe(classifySatiationBand(s, cfg));
    }
  });
});

describe('classifySatiationBandPosition', () => {
  it.each<[number, string, number]>([
    [wellFedMid, 'wellFed', 0.5],
    [wellFed, 'wellFed', 0],
    [100, 'overfed', 1],
    [150, 'overfed', 1],
    [0, 'starving', 0],
  ])('places satiation %d in %s at progress %d', (satiation, band, progress) => {
    const p = classifySatiationBandPosition(satiation, cfg);
    expect(p.band).toBe(band);
    expect(p.progress).toBeCloseTo(progress, 10);
  });
});

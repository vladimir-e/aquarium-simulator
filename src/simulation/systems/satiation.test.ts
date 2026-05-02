import { describe, it, expect } from 'vitest';
import {
  satiationContribution,
  classifySatiationBand,
  classifySatiationBandPosition,
  SATIATION_BAND_LABEL,
} from './satiation.js';
import { livestockDefaults } from '../config/livestock.js';

const cfg = livestockDefaults;

/**
 * `satiationContribution` is the single piecewise-linear function that
 * drives the entire hunger / well-fed / overfed channel for fish
 * vitality. These tests pin the curve shape at every band's endpoints
 * and midpoints, plus continuity at the four band boundaries.
 *
 * Bands at default config:
 *   100 → 90  Overfed   (peak severity 0.6 at 100, zero at 90)
 *    90 → 75  Well-fed  (zero at edges, peak benefit 0.3 at midpoint 82.5)
 *    75 → 50  Peckish   (neutral)
 *    50 → 25  Hungry    (zero at 50, severity 2.5 at 25)
 *    25 →  0  Starving  (severity 2.5 at 25 ramps to 5.0 at 0)
 */

describe('satiationContribution — band endpoints and midpoints', () => {
  it('overfed peak at satiation = 100', () => {
    const c = satiationContribution(100, cfg);
    expect(c.band).toBe('overfed');
    expect(c.stressor).toBeCloseTo(cfg.satiationOverfedSeverity, 10);
    expect(c.benefit).toBe(0);
  });

  it('overfed midpoint (95) is half the peak severity', () => {
    const c = satiationContribution(95, cfg);
    expect(c.band).toBe('overfed');
    expect(c.stressor).toBeCloseTo(cfg.satiationOverfedSeverity / 2, 10);
    expect(c.benefit).toBe(0);
  });

  it('well-fed peak at satiation = 82.5 (mid of 75–90)', () => {
    const c = satiationContribution(82.5, cfg);
    expect(c.band).toBe('wellFed');
    expect(c.benefit).toBeCloseTo(cfg.satiationWellFedPeak, 10);
    expect(c.stressor).toBe(0);
  });

  it('well-fed left midpoint (78.75) is half the peak benefit', () => {
    const c = satiationContribution(78.75, cfg);
    expect(c.band).toBe('wellFed');
    expect(c.benefit).toBeCloseTo(cfg.satiationWellFedPeak / 2, 10);
    expect(c.stressor).toBe(0);
  });

  it('well-fed right midpoint (86.25) is half the peak benefit', () => {
    const c = satiationContribution(86.25, cfg);
    expect(c.band).toBe('wellFed');
    expect(c.benefit).toBeCloseTo(cfg.satiationWellFedPeak / 2, 10);
    expect(c.stressor).toBe(0);
  });

  it('peckish midpoint (62.5) is neutral (no contribution)', () => {
    const c = satiationContribution(62.5, cfg);
    expect(c.band).toBe('peckish');
    expect(c.stressor).toBe(0);
    expect(c.benefit).toBe(0);
  });

  it('hungry edge (just below 50) starts at near-zero stress', () => {
    const c = satiationContribution(49.9, cfg);
    expect(c.band).toBe('hungry');
    expect(c.stressor).toBeGreaterThan(0);
    expect(c.stressor).toBeLessThan(0.05);
    expect(c.benefit).toBe(0);
  });

  it('hungry midpoint (37.5) is half the hungry-band severity', () => {
    const c = satiationContribution(37.5, cfg);
    expect(c.band).toBe('hungry');
    expect(c.stressor).toBeCloseTo(cfg.satiationHungrySeverity / 2, 10);
    expect(c.benefit).toBe(0);
  });

  it('hungry anchor at satiation = 25 hits the hungry severity', () => {
    const c = satiationContribution(25, cfg);
    expect(c.band).toBe('hungry');
    expect(c.stressor).toBeCloseTo(cfg.satiationHungrySeverity, 10);
    expect(c.benefit).toBe(0);
  });

  it('starving anchor at satiation = 0 hits the starving severity', () => {
    const c = satiationContribution(0, cfg);
    expect(c.band).toBe('starving');
    expect(c.stressor).toBeCloseTo(cfg.satiationStarvingSeverity, 10);
    expect(c.benefit).toBe(0);
  });

  it('starving midpoint (12.5) is the average of hungry and starving severities', () => {
    const c = satiationContribution(12.5, cfg);
    expect(c.band).toBe('starving');
    expect(c.stressor).toBeCloseTo(
      (cfg.satiationHungrySeverity + cfg.satiationStarvingSeverity) / 2,
      10
    );
    expect(c.benefit).toBe(0);
  });

  it('starving slope is steeper than hungry slope', () => {
    // The whole point of the starving band: per-unit-satiation damage
    // climbs faster than the hungry slope.
    const hungrySlope = cfg.satiationHungrySeverity / 25; // hungry band width
    const starvingSlope = (cfg.satiationStarvingSeverity - cfg.satiationHungrySeverity) / 25;
    expect(starvingSlope).toBeGreaterThan(hungrySlope);
  });
});

describe('satiationContribution — continuity at boundaries', () => {
  // The curve must pass smoothly through zero at every transition:
  // 90 (overfed → well-fed), 75 (well-fed → peckish), 50 (peckish →
  // hungry). At 25 (hungry → starving) the curve does NOT cross zero —
  // it crosses through `satiationHungrySeverity`.
  it('zero at satiation = 90 (overfed/well-fed boundary)', () => {
    const c = satiationContribution(90, cfg);
    expect(c.stressor).toBe(0);
    expect(c.benefit).toBe(0);
  });

  it('zero at satiation = 75 (well-fed/peckish boundary)', () => {
    const c = satiationContribution(75, cfg);
    expect(c.stressor).toBe(0);
    expect(c.benefit).toBe(0);
  });

  it('zero at satiation = 50 (peckish/hungry boundary)', () => {
    const c = satiationContribution(50, cfg);
    expect(c.stressor).toBe(0);
    expect(c.benefit).toBe(0);
  });

  it('continuous (matching value from both sides) at satiation = 25', () => {
    // Approach 25 from above (hungry side, ramping up to severity) and
    // below (starving side, starting at severity). They must match.
    const fromAbove = satiationContribution(25 + 1e-9, cfg);
    const fromBelow = satiationContribution(25 - 1e-9, cfg);
    expect(Math.abs(fromAbove.stressor - fromBelow.stressor)).toBeLessThan(1e-6);
  });

  it('only one side is non-zero anywhere on the axis', () => {
    // No double-counting: the stressor and benefit channels must never
    // both be non-zero for the same satiation value.
    for (let s = 0; s <= 100; s += 0.5) {
      const c = satiationContribution(s, cfg);
      const both = c.stressor > 0 && c.benefit > 0;
      expect(both).toBe(false);
    }
  });
});

describe('satiationContribution — clamping outside [0, 100]', () => {
  it('clamps satiation > 100 to the overfed peak', () => {
    const c = satiationContribution(150, cfg);
    expect(c.band).toBe('overfed');
    expect(c.stressor).toBeCloseTo(cfg.satiationOverfedSeverity, 10);
  });

  it('clamps satiation < 0 to the starving peak', () => {
    const c = satiationContribution(-5, cfg);
    expect(c.band).toBe('starving');
    expect(c.stressor).toBeCloseTo(cfg.satiationStarvingSeverity, 10);
  });
});

describe('classifySatiationBand', () => {
  it('classifies each band correctly at internal points', () => {
    expect(classifySatiationBand(100, cfg)).toBe('overfed');
    expect(classifySatiationBand(95, cfg)).toBe('overfed');
    expect(classifySatiationBand(85, cfg)).toBe('wellFed');
    expect(classifySatiationBand(80, cfg)).toBe('wellFed');
    expect(classifySatiationBand(70, cfg)).toBe('peckish');
    expect(classifySatiationBand(50, cfg)).toBe('peckish');
    expect(classifySatiationBand(40, cfg)).toBe('hungry');
    expect(classifySatiationBand(25, cfg)).toBe('hungry');
    expect(classifySatiationBand(15, cfg)).toBe('starving');
    expect(classifySatiationBand(0, cfg)).toBe('starving');
  });

  it('uses the configured floor as the lower edge of each band', () => {
    expect(classifySatiationBand(cfg.satiationOverfedFloor, cfg)).toBe('overfed');
    expect(classifySatiationBand(cfg.satiationOverfedFloor - 0.001, cfg)).toBe('wellFed');
    expect(classifySatiationBand(cfg.satiationWellFedFloor, cfg)).toBe('wellFed');
    expect(classifySatiationBand(cfg.satiationWellFedFloor - 0.001, cfg)).toBe('peckish');
  });
});

describe('classifySatiationBandPosition', () => {
  // Band positions drive the dot indicator under the UI status label —
  // 0 sits at the lower edge of the band, 1 at the upper edge.
  it('puts a fish at the well-fed midpoint at progress 0.5', () => {
    const p = classifySatiationBandPosition(82.5, cfg);
    expect(p.band).toBe('wellFed');
    expect(p.progress).toBeCloseTo(0.5, 6);
  });

  it('puts a fish at the well-fed lower edge at progress 0', () => {
    const p = classifySatiationBandPosition(75, cfg);
    expect(p.band).toBe('wellFed');
    expect(p.progress).toBeCloseTo(0, 6);
  });

  it('puts a fish at satiation 100 at progress 1 in the overfed band', () => {
    const p = classifySatiationBandPosition(100, cfg);
    expect(p.band).toBe('overfed');
    expect(p.progress).toBeCloseTo(1, 6);
  });

  it('puts a fully starving fish at progress 0 in the starving band', () => {
    const p = classifySatiationBandPosition(0, cfg);
    expect(p.band).toBe('starving');
    expect(p.progress).toBeCloseTo(0, 6);
  });

  it('clamps satiation > 100 to overfed progress 1', () => {
    const p = classifySatiationBandPosition(150, cfg);
    expect(p.band).toBe('overfed');
    expect(p.progress).toBeCloseTo(1, 6);
  });
});

describe('SATIATION_BAND_LABEL', () => {
  it('has a human label for every band', () => {
    expect(SATIATION_BAND_LABEL.overfed).toBe('Overfed');
    expect(SATIATION_BAND_LABEL.wellFed).toBe('Well fed');
    expect(SATIATION_BAND_LABEL.peckish).toBe('Peckish');
    expect(SATIATION_BAND_LABEL.hungry).toBe('Hungry');
    expect(SATIATION_BAND_LABEL.starving).toBe('Starving');
  });
});

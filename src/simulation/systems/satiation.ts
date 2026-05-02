/**
 * Satiation contribution — five-band model on the 0–100 satiation axis.
 *
 * Bands (UI labels only — internally the contribution is one continuous
 * piecewise-linear function whose inflection points sit at the band
 * boundaries):
 *
 * | Satiation   | Label     | Contribution           |
 * |-------------|-----------|------------------------|
 * | 100 → 90    | Overfed   | stressor               |
 * | 90  → 75    | Well fed  | benefit                |
 * | 75  → 50    | Peckish   | neutral (no contrib)   |
 * | 50  → 25    | Hungry    | stressor               |
 * | 25  →  0    | Starving  | stressor (steeper)     |
 *
 * Anchor points:
 * - s = 100 → overfed stress at peak
 * - s =  90 → zero (boundary into well-fed)
 * - s = 82.5 (mid well-fed) → well-fed benefit at peak
 * - s =  75 → zero (boundary into peckish)
 * - s =  50 → zero (boundary into hungry)
 * - s =  25 → hungry stress at "moderate" severity
 * - s =   0 → starving stress at "severe" severity
 *
 * Linear ramps connect adjacent anchors. The function is continuous —
 * passes smoothly through zero at every band boundary, no cliffs.
 *
 * The helper returns `{ stressor, benefit }` separately so the vitality
 * engine can keep stressors and benefits as independent factor lists.
 * Only one side is ever non-zero for a given satiation; the other side
 * is `0`. The breakdown shape stays stable for tests/UI keying by name.
 */

import type { LivestockConfig } from '../config/livestock.js';

export type SatiationBand = 'overfed' | 'wellFed' | 'peckish' | 'hungry' | 'starving';

export interface SatiationContribution {
  /** Active band (UI label key). */
  band: SatiationBand;
  /** Stressor amount (≥ 0); zero unless the fish is in overfed/hungry/starving. */
  stressor: number;
  /** Benefit amount (≥ 0); zero unless the fish is in well-fed. */
  benefit: number;
}

/**
 * Map satiation to its current band. Boundaries belong to the *lower*
 * band so the well-fed range is `[wellFedFloor, overfedFloor)` etc. —
 * the contribution is zero at every boundary regardless, so the choice
 * is purely cosmetic for the band label.
 */
export function classifySatiationBand(
  satiation: number,
  config: LivestockConfig
): SatiationBand {
  const {
    satiationOverfedFloor,
    satiationWellFedFloor,
    satiationHungryCeiling,
    satiationStarvingCeiling,
  } = config;
  if (satiation >= satiationOverfedFloor) return 'overfed';
  if (satiation >= satiationWellFedFloor) return 'wellFed';
  if (satiation >= satiationHungryCeiling) return 'peckish';
  if (satiation >= satiationStarvingCeiling) return 'hungry';
  return 'starving';
}

/**
 * Human-readable label per band — used by the vitality breakdown
 * stressor row (band-aware on the stress side) and the UI status label.
 */
export const SATIATION_BAND_LABEL: Record<SatiationBand, string> = {
  overfed: 'Overfed',
  wellFed: 'Well fed',
  peckish: 'Peckish',
  hungry: 'Hungry',
  starving: 'Starving',
};

/**
 * Linearly interpolate `t` from `[a, b]` to `[fa, fb]`. Used to ramp
 * each band's contribution between its anchor points.
 */
function lerp(t: number, a: number, b: number, fa: number, fb: number): number {
  if (b === a) return fa;
  const u = (t - a) / (b - a);
  return fa + u * (fb - fa);
}

/**
 * Compute the satiation contribution at a given satiation level under
 * the configured band edges and severity peaks.
 *
 * Sign convention: `stressor` and `benefit` are both ≥ 0. Vitality
 * engine adds them on opposite sides of the ledger.
 */
export function satiationContribution(
  satiation: number,
  config: LivestockConfig
): SatiationContribution {
  const s = Math.max(0, Math.min(100, satiation));
  const {
    satiationOverfedFloor,
    satiationWellFedFloor,
    satiationHungryCeiling,
    satiationStarvingCeiling,
    satiationOverfedSeverity,
    satiationWellFedPeak,
    satiationHungrySeverity,
    satiationStarvingSeverity,
  } = config;

  // Overfed: ramp from 0 at satiationOverfedFloor to peak severity at 100.
  if (s >= satiationOverfedFloor) {
    const stress = lerp(s, satiationOverfedFloor, 100, 0, satiationOverfedSeverity);
    return { band: 'overfed', stressor: stress, benefit: 0 };
  }

  // Well-fed: triangular peak at the midpoint between the two band
  // edges. Zero at both boundaries, peak in the middle.
  if (s >= satiationWellFedFloor) {
    const mid = (satiationOverfedFloor + satiationWellFedFloor) / 2;
    const benefit =
      s <= mid
        ? lerp(s, satiationWellFedFloor, mid, 0, satiationWellFedPeak)
        : lerp(s, mid, satiationOverfedFloor, satiationWellFedPeak, 0);
    return { band: 'wellFed', stressor: 0, benefit };
  }

  // Peckish: neutral.
  if (s >= satiationHungryCeiling) {
    return { band: 'peckish', stressor: 0, benefit: 0 };
  }

  // Hungry: ramp from 0 at the hungry ceiling to the configured hungry
  // severity at the starving ceiling.
  if (s >= satiationStarvingCeiling) {
    const stress = lerp(
      s,
      satiationHungryCeiling,
      satiationStarvingCeiling,
      0,
      satiationHungrySeverity
    );
    return { band: 'hungry', stressor: stress, benefit: 0 };
  }

  // Starving: ramp from the hungry severity at the starving ceiling to
  // the starving severity at satiation 0. Steeper than the hungry slope
  // by construction — the curve continues linearly from the hungry
  // anchor through the starving anchor.
  const stress = lerp(
    s,
    satiationStarvingCeiling,
    0,
    satiationHungrySeverity,
    satiationStarvingSeverity
  );
  return { band: 'starving', stressor: stress, benefit: 0 };
}

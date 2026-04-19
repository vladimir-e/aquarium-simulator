# Task 33: Low-volume stressors calibration (Scenario 04)

**Status:** completed

## Overview

Calibrate the small-volume edge-case scenarios against
`docs/calibration/scenarios/04-low-volume-stressors.md` — a 5 gal (19 L)
tank in three configurations:

- **Variant A — baseline betta**: filterless 19 L with 1 betta, 1
  anubias on driftwood, gravel, 27°C heater, weekly 30 % WC. Steady
  state over 8+ weeks. NH3 pinned at 0, NO3 10–15 ppm between WCs.
- **Variant A.1 — cold failure**: same setup but heater disabled at
  tick 168. Temp drifts to 20°C within 24 h. Betta hardiness 0.6 →
  gradual decline from health 95 to 40–65 over 7 days.
- **Variant B — overcrowded**: 10 neons (5 g bioload) in the same 19 L
  without filter. NH3 climbs ~2× faster than scenario 1's 10-gal case,
  first deaths by day 4–5, mass die-off by day 7.

Tests low-volume amplification, filterless equilibrium, small-tank
thermal drift, betta cold tolerance, and multi-stressor aggregation.

## References

- Scenario: `docs/calibration/scenarios/04-low-volume-stressors.md`
- Prior report (format): `docs/calibration/runs/2026-04-19-planted-equilibrium.md`
- Configs: `livestock.ts`, `temperature.ts`, `decay.ts`, `nitrogen-cycle.ts`
- Engine: `systems/fish-health.ts`, `systems/temperature-drift.ts`,
  `equipment/heater.ts`

## Scope

### In scope
- Coefficient tuning in `src/simulation/config/*`.
- New calibration runner: `scripts/calibrate-low-volume.ts`.
- Engine changes only where a missing mechanic is clearly uncovered
  (e.g., if small-tank thermal drift is off, tune `coolingCoefficient`
  or `volumeExponent`; if betta cold-stress coefficient is wrong,
  tune `temperatureStressSeverity`).
- Report `docs/calibration/runs/2026-04-19-low-volume-stressors.md`.

### Out of scope
- Already-calibrated subsystems (N-cycle, gas exchange, plants, pH
  coupling) unless a bug surfaces.
- CLI, scenario markdown, other calibration runs.

## Implementation

- Build `scripts/calibrate-low-volume.ts` mirroring
  `scripts/calibrate-planted.ts`. Flags: `--variant=A|A1|B`, `--days=N`,
  `--every=H`.
- **Variant A** (longest hold): verify filterless steady state over 8
  weeks with weekly WC. Check NH3/NO2/NO3 cycle transient → steady.
- **Variant A.1**: thermal drift first (hit 20°C within 24 h), then
  betta health decline timeline.
- **Variant B**: NH3 rise rate ~2× scenario 1 at same fish mass, die-off
  day 4–5.
- Iterate in ~8 bounded steps. Prefer tuning over engine changes.

## Acceptance criteria

- Variant A: NH3/NO2 pinned near 0 by week 2, NO3 sawtooth 5–18 ppm
  with weekly WC, betta health > 90 at day 28.
- Variant A.1: temp hits 20–21°C within 24 h of heater failure; betta
  health lands 40–65 at day 14, possibly dead at day 21.
- Variant B: first death by day 5, mass die-off by day 7.
- `npm run lint`, `npm run test`, `npm run build` all green.
- Clean commit on `calibration/low-volume-stressors`, pushed. No PR.

## Notes

Report must include per-variant checkpoint tables, coefficient/engine
changes with rationale, and confidence notes. Special attention: did
the low-volume amplification show up (Variant B vs. Scenario 1), and
did `ambientWaste = 0.001 g/hr` survive at 19 L?

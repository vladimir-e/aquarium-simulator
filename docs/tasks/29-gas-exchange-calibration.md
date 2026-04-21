# Task 29: Gas exchange calibration

**Status:** completed

## Overview

The first S3 community calibration run exposed a severe O2 crash: starting
from 7.5 mg/L in a 150 L community tank (20 neon tetra + 4 angelfish, 70 g
bioload), O2 collapsed below 3 mg/L within 7 hours and killed the tank in
under a day. Target real-world behaviour is a healthy 6–8 mg/L steady
state. This task fixes the imbalance between fish respiration draw and
surface exchange.

## References

- `docs/calibration/scenarios/03-community-steady-state.md` — canonical
  target behaviour for the failing scenario.
- `docs/calibration/runs/2026-04-19-gas-exchange.md` — the run report
  with measurements and final coefficients.

## Scope

### In Scope

- `src/simulation/config/livestock.ts` — respiration coefficient + unit.
- `src/simulation/config/gas-exchange.ts` — exchange coefficients if the
  drift warrants it.
- `src/simulation/systems/metabolism.ts` — respiration return units.
- `src/simulation/livestock/index.ts` — concentration conversion at the
  effect boundary.
- Tests and scenarios that exercise respiration / exchange semantics.

### Out of Scope

- Plant photosynthesis / respiration coefficients (flagged separately if
  S2 diurnal swing is off).
- Nitrogen cycle coefficients (calibrated in Task 26).
- Scenario markdown files and non-gas-exchange calibration runs.

## Implementation

- Root cause: `baseRespirationRate` was documented as "mg/L O2 per gram
  per hour" and applied directly as a concentration delta — a bug that
  silently embedded the tank volume in the coefficient. A 70 g bioload at
  the default 0.02 drew 1.4 mg/L/hr regardless of tank size. In a 150 L
  tank the realistic draw is ≈0.14 mg/L/hr — 10× less.
- Fix: treat `baseRespirationRate` as an intrinsic physiological rate —
  mg O2 consumed per gram of fish per hour — independent of tank volume.
  `metabolism.processMetabolism` now returns absolute
  `oxygenConsumedMg` / `co2ProducedMg` (consistent with how ammonia is
  already returned). `livestock/index` divides by `state.resources.water`
  when emitting the effect, matching the decay system's pattern.
- Coefficient: set default to 0.3 mg O2 / g / hr — the midpoint of the
  real-world 0.2–0.5 range for small freshwater teleosts at 25 °C.
- Gas-exchange config was *not* changed. Measurements showed the existing
  `baseExchangeRate = 0.25` plus the community preset's canister flow
  gives ~0.2 mg/L/hr per 1 mg/L deficit — correctly within the real-world
  0.2–0.5 range.
- Aeration direct O2 injection already guards against supersaturation
  (only injects when below saturation) — no change needed.

## Acceptance Criteria

- [x] Isolated respiration test: 70 g bioload in 150 L draws ≈0.14 mg/L/hr.
- [x] Isolated exchange test: 150 L with canister returns toward saturation
  at ≈0.2 mg/L/hr per 1 mg/L deficit, fully recovers inside 48 h from 4 mg/L.
- [x] S3 community 72 h: O2 holds 7.8–8.2 mg/L, 24/24 fish alive.
- [x] S3 community 30 d (with weekly WC): O2 holds 7.4–8.0 mg/L, 24/24 alive.
- [x] Overstocked 5 gal: O2 does not crash (held 8 mg/L). NB — fish still
  die from nitrogen cycle under-capacity, flagged separately.
- [x] Filterless betta: O2 settles at 6.35 mg/L, within task-expected 5–7
  mg/L envelope. Fish dies from ammonia, orthogonal to gas exchange.
- [x] `npm run lint`, `npm run build`, full `npx vitest run` pass.
- [x] `npx tsx src/cli/sim.ts smoke` passes.

## Tests

- Updated `src/simulation/systems/metabolism.test.ts` and
  `src/simulation/livestock/index.test.ts` to assert the new
  `oxygenConsumedMg` / `co2ProducedMg` semantics. Other tests (photosynthesis,
  plant respiration, gas exchange integration) unchanged.

## Notes

- See calibration run report for the full numerical trace and engine-level
  callouts surfaced during this task. Two items are flagged for follow-up:
  - Filterless tanks currently have **zero** surface diffusion (flow = 0 ⇒
    flowFactor = 0). Real aquaria have baseline air/water gas exchange even
    without a filter.
  - 100-gal S3 equivalent at same bioload density dies from a nitrogen
    cycle NH3 burst on first feeding — unrelated to O2, likely a bacterial
    processing-rate scaling bug at larger volumes.

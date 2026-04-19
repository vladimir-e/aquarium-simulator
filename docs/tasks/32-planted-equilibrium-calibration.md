# Task 32: Planted-equilibrium calibration (Scenario 02)

**Status:** completed

## Overview

Calibrate the plants subsystem against `docs/calibration/scenarios/02-planted-equilibrium.md` —
heavily planted 10 gal, aqua soil, CO2 injection, lean feeding, mixed-demand
plant species. Two variants:

- **Variant A**: EI-dosed, auto-doser daily. Target: plants thrive, NO3 5–20 ppm,
  algae < 10, midday O2 8–11 mg/L, pH diurnal swing ≥ 0.3.
- **Variant B**: undosed, fish-waste-only. Target: high-demand plants stall at
  condition 30–55 %, Amazon Sword 55–75 %, Java Fern > 75 %, NO3 2–10 ppm,
  algae 3–15.

This is the primary calibration for a large slice of the engine that has not
been exercised by earlier scenarios:

- Photosynthesis (Liebig's Law across NO3/PO4/K/Fe)
- Plant nutrient consumption
- Plant condition dynamics (thriving / adequate / struggling / starving)
- Algae suppression by plant competition
- CO2 injection → diurnal pH swing
- Auto-doser action
- Plant O2 production → midday supersaturation

## References

- Scenario: `docs/calibration/scenarios/02-planted-equilibrium.md`
- Prior run report (for format): `docs/calibration/runs/2026-04-19-uncycled-quarantine.md`
- Specs: `docs/6-PLANTS.md` (primary), `docs/5-RESOURCES.md`, `docs/2-ENVIRONMENT.md`
- Configs: `src/simulation/config/plants.ts`, `nutrients.ts`, `algae.ts`, `ph.ts`,
  `gas-exchange.ts`, `livestock.ts`
- Engine: `src/simulation/plants/index.ts`, `systems/photosynthesis.ts`,
  `systems/nutrients.ts`, `systems/algae.ts`, `systems/ph-drift.ts`

## Scope

### In Scope

- Coefficient tuning in any file under `src/simulation/config/`.
- Engine changes in `src/simulation/systems/` where a missing mechanic is
  uncovered (e.g., CO2 → pH coupling, plant O2 output, nutrient consumption
  scaling).
- New calibration runner script: `scripts/calibrate-planted.ts`.
- Report `docs/calibration/runs/2026-04-19-planted-equilibrium.md`.

### Out of Scope

- N-cycle retuning (just calibrated by Task 31). Flag if anything looks wrong.
- Gas-exchange respiration / filterless minflow (just calibrated).
- CLI, scenario markdown, unrelated calibration runs.
- Aqua-soil NH4 leaching — scenario allows stubbing.

## Implementation

- Build a `scripts/calibrate-planted.ts` runner mirroring
  `scripts/calibrate-uncycled.ts`. Supports `--variant=A|B`, `--days=N`,
  `--fishless`, `--every=H` for sampling interval.
- **Isolate plants first**: fishless planted tank, seeded bacteria, manual
  dosing at scenario rate. Verify photosynthesis, nutrient consumption,
  Liebig's Law gating, algae competition in a clean environment.
- **Composite A**: full setup (fish + plants + auto-doser).
- **Composite B**: same minus doser.
- **Diurnal probe**: `--every=1` to trace the 24 h O2/CO2/pH cycle.
- Iterate in ~8 bounded steps. Prefer coefficient tuning; only reach for
  engine changes when a mechanic is clearly missing or wrong.

Likely engine gap based on scenario hints:
- CO2 → pH linear coupling might be too weak at the 20–35 ppm CO2 range.
  Scenario expects ≥0.3 units swing. Henderson-Hasselbalch-style coupling
  through carbonic acid is the clean fix.

## Acceptance Criteria

- Variant A: Day-28 checkpoints met (NO3 5–20, algae < 10, O2 midday 8–11
  with allowance, pre-dawn 5.5–7, plant size 60–90 %, avg condition > 80).
- Variant B: Day-28 checkpoints met (Monte Carlo 30–55, Amazon Sword 55–75,
  Java Fern > 75, NO3 2–10, algae 3–15).
- Diurnal pH swing ≥ 0.3 units when CO2 is active.
- `npm run lint`, `npm run test`, `npm run build` all green.
- Clean commit on `calibration/planted-equilibrium`.

## Tests

- Add or update unit tests alongside any engine change.
- No functional regressions in existing tests.

## Notes

Report must include: branch, commit SHA, per-variant checkpoint tables,
coefficient and engine changes with rationale, confidence level.

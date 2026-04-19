# Task 31: NOB/NO2 processing asymmetry

**Status:** completed

## Overview

The nitrogen cycle engine tracks NH3/NO2/NO3 as compound mass (mg). Stoichiometry
(Task 26) correctly scales compound mass across conversion steps by molecular
weight: 1 mg NH3 oxidised yields ≈ 2.702 mg NO2, and 1 mg NO2 oxidised yields
≈ 1.348 mg NO3.

AOB and NOB share a single `bacteriaProcessingRate` knob, interpreted as
"compound mass processed per bacterium per tick." With equal per-bacterium
rates, NOB can clear only `1 / 2.702 ≈ 37 %` of the NO2 mass that AOB
produce — nitrite runs away even with populations at carrying capacity.

Symptom: seeded-filter scenarios see NO2 climb to 30+ ppm in runs where it
should cap at 1–3 ppm.

## References

- `docs/calibration/scenarios/01-uncycled-quarantine.md` (days 10+ NO2
  blow-up)
- `docs/tasks/26-nitrogen-stoichiometry.md` (MW constants, compound mass
  tracking)
- `src/simulation/systems/nitrogen-cycle.ts`

## Scope

### In Scope

- Derive a `NOB_PROCESSING_RATE_MULTIPLIER = MW_NO2 / MW_NH3` constant
  from existing MW constants.
- Apply the multiplier at the NOB processing callsite in
  `calculateNitriteToNitrate`.
- Update related tests / expectations.

### Out of Scope

- Refactor to internal N-mass tracking (separate design discussion).
- Changes to CLI, scenarios, or other systems.
- Separate tunable NOB rate knob.

## Implementation

- Add `NOB_PROCESSING_RATE_MULTIPLIER` next to the MW ratio constants
  in `systems/nitrogen-cycle.ts`, derived from `MW_NO2 / MW_NH3`.
- In `calculateNitriteToNitrate`, multiply `config.bacteriaProcessingRate`
  by the new constant when computing `canProcessMass`.
- `bacteriaProcessingRate` remains the AOB baseline; NOB inherits
  `rate × multiplier`. One source of truth; stoichiometric meaning
  documented in a comment.

## Acceptance Criteria

- Per-step N-mass balance continues to hold (AOB/NOB steps conserve N
  atoms; compound mass ratios unchanged).
- Fishless seeded-dose steady state: NO2 steady-state concentration
  drops by ~2.7× vs the pre-fix run.
- S1 uncycled-quarantine day-10 NO2 stays in the 1–3 ppm band rather
  than climbing to 30+ ppm.
- S3 community NO3 sawtooth (24 → 40 ppm between water changes)
  regression holds.
- `npm run lint`, full test suite, build, and `sim smoke` all pass.

## Tests

- Unit: `calculateNitriteToNitrate` consumes NOB capacity at the scaled
  rate; mass ratio of produced NO3 per consumed NO2 remains 1.348.
- Unit: parity with AOB when populations and multiplier align
  (regression guard for the constant).
- Existing nitrogen-cycle tests still pass after callsite change.

## Notes

Biologically legit: real NOB (Nitrobacter / Nitrospira) are faster
per cell than AOB (Nitrosomonas / Nitrosospira). The engine's prior
symmetric treatment was a simplification.

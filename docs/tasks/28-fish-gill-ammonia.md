# Task 28: Direct gill ammonia excretion

**Status:** completed

## Overview

Close a biological correctness gap surfaced by Task 26 (nitrogen-chain
stoichiometry). Freshwater fish are ammoniotelic: they excrete the bulk
of their nitrogenous waste as NH3/NH4⁺ directly through the gills, with
only a minority leaving as solid waste (feces). Our current metabolism
system routes 100 % of fish N through the feces → waste → NH3 path,
undercounting NH3 production and (per the Task 26 calibration run)
missing ~3× of the observed NO3 rise rate in the S3 community scenario.

Canonical excretion split for aquarium fish: ≈75–80 % gill NH3,
≈15–20 % feces N, ≈5 % urine. Urine collapses into the gill stream for
simulation purposes, giving a **~80 / 20 gill / feces split by N-mass**.

## References

- `docs/tasks/26-nitrogen-stoichiometry.md` — upstream calibration
  finding; see the "Path forward" section, option 2 ("Revisit the fish
  waste model").
- `docs/calibration/runs/2026-04-19-community-steady-state.md` — S3
  anchor and the gap this task addresses.
- `src/simulation/systems/metabolism.ts` — where food consumption
  currently becomes waste.
- `src/simulation/livestock/index.ts` — where metabolism results become
  resource effects.
- `src/simulation/systems/nitrogen-cycle.ts` — MW ratios and the
  waste → NH3 conversion this task bypasses for the gill path.
- `src/simulation/config/livestock.ts` — metabolism tunables.

## Scope

### In Scope

- Split fish N output: ~80 % direct NH3 (to `resources.ammonia`),
  ~20 % feces-bound (to `resources.waste`) by N-mass.
- Apply the MW ratio (MW_NH3 / MW_N = 17.03 / 14.01) when emitting
  direct NH3 so compound mass is correct.
- Introduce tunables on `LivestockConfig`:
  - `foodNitrogenFraction` — fraction of food mass that is N
    (default 0.05, matching the engine's existing assumption that
    `wasteToAmmoniaRatio = 60 mg NH3/g waste` embeds).
  - `gillNFraction` — fraction of food N excreted directly via gills
    (default 0.80).
- Rewire the waste-production math in metabolism so it represents the
  feces-bound N share at the engine's existing waste N-content
  (5 % N by mass). The legacy `wasteRatio` tunable is no longer
  independently meaningful and gets removed.
- Unit tests for the split, for N-mass conservation end-to-end, and
  parity with the fishless path (unchanged output).

### Out of Scope

- Gas-exchange / O2-crash calibration. S3 with live fish cannot run
  end-to-end until that is fixed; this task stops at the NH3 pathway.
- Any change to fishless seeded behavior (waste → NH3 → NO2 → NO3
  stoichiometry is already correct after Task 26).
- Plants / algae / pH / CO2 systems, CLI, scenario markdown.

## Implementation

### The splice point

`src/simulation/systems/metabolism.ts :: processMetabolism` — the per-
fish loop that computes `foodGiven` and currently adds
`foodGiven * wasteRatio` to `totalWaste`. This is the single place
that knows how much food each fish has ingested, so it is the natural
home for the N-split.

### The math

Per fish per tick, given `foodGiven` grams ingested:

```
nIngested        = foodGiven * foodNitrogenFraction                (g N)
nToGills         = nIngested * gillNFraction                       (g N)
nToWaste         = nIngested * (1 - gillNFraction)                 (g N)

directNH3        = nToGills * (MW_NH3 / MW_N) * 1000               (mg NH3)
wasteMass        = nToWaste / foodNitrogenFraction                 (g waste)
                 = foodGiven * (1 - gillNFraction)
```

`wasteMass = foodGiven × (1 − gillNFraction)` is derived, not
independently tuned. At `gillNFraction = 0.80` that gives 0.2 g waste
per gram of food ingested — in the same ballpark as the old 0.3
`wasteRatio` but now grounded in N accounting rather than a free
parameter. The existing `decay.ts` + `nitrogen-cycle.ts` path will
mineralize that waste to NH3 at the established 60 mg NH3/g waste
ratio, yielding exactly the feces-bound N by construction.

### Changes

1. **`src/simulation/config/livestock.ts`**
   - Add `foodNitrogenFraction: number` (default 0.05).
   - Add `gillNFraction: number` (default 0.80).
   - Remove `wasteRatio` from `LivestockConfig`, `livestockDefaults`,
     and `livestockConfigMeta`. Nothing else in the codebase references
     it outside metabolism.
   - Add `livestockConfigMeta` entries for the two new knobs.

2. **`src/simulation/systems/metabolism.ts`**
   - Import `MW_NH3` (re-export from nitrogen-cycle) or declare a
     shared physics constant. MW_N = 14.01 is new.
   - Extend `MetabolismResult` with `ammoniaProduced: number` (mg).
   - In the per-fish loop, compute `nIngested`, `directNH3`,
     `wasteMass` as above; accumulate `totalAmmonia` and `totalWaste`.

3. **`src/simulation/livestock/index.ts`**
   - Emit an `ammonia` effect at `tier: 'active'` with source
     `fish-gill-excretion` when `metabolismResult.ammoniaProduced > 0`.
   - Waste effect stays as is; it now carries the feces-bound share.

4. **Nitrogen-cycle MW constants**
   - Export `MW_NH3` and a new `MW_N` from `systems/nitrogen-cycle.ts`
     (or move both to a small shared `physics.ts` if the surface grows).
     Metabolism imports them so there is exactly one source of truth
     for the ratio.

### Tests (file-level pointers, no code in task doc)

- `systems/metabolism.test.ts`:
  - Replace the existing `wasteProduced ≈ foodConsumed × 0.3` assertion
    with the N-conservation split: X mg food → X × 0.8 × 0.05 × 1000 ×
    17.03 / 14.01 mg direct NH3 + X × 0.2 g waste.
  - Add: `ammoniaProduced` scales linearly with ingested food.
  - Add: `ammoniaProduced` is zero when no food is eaten.
- `livestock/index.test.ts`:
  - Add: an `ammonia` effect with source `fish-gill-excretion` is
    emitted alongside the waste effect.
- New: `simulation/__tests__/n-conservation.test.ts` (or a new
  describe block in an existing file) — over N ticks with a live fish
  eating, total N accumulated as direct NH3 + N-equivalent in produced
  waste equals total N ingested (±floating-point tolerance).
- Sanity: `systems/nitrogen-cycle.test.ts` unchanged. `systems/decay.test.ts`
  unchanged. Fishless-seeded path produces the same NO3 trajectory.

## Acceptance Criteria

- N-mass conservation holds across the fish-eating path (unit test).
- Fishless seeded test path output is byte-identical to before
  (no regression in `systems/nitrogen-cycle.test.ts`).
- `npm run lint` clean, all unit tests pass, `npm run build` succeeds.
- `npx tsx src/cli/sim.ts smoke` passes end-to-end.
- Unit-test asserts exact numbers for the split: e.g. 1 g food →
  48.65 mg direct NH3 + 0.2 g waste (at defaults).

## S3 verification

S3 end-to-end with live fish is blocked by the still-open gas-exchange
calibration: fish die of O2 starvation within 18 hours regardless of
the NH3 pathway. Options for surfacing the NH3 pathway in integration:

- **Synthetic scenario override.** Force `baseRespirationRate` to a
  tiny value (e.g. 0.0001) and turn air pump on, run 6 days with live
  fish, measure NO3 rise. Document the override as scaffolding, not a
  permanent config change.
- **Unit-test level.** The numerical split assertions above already
  prove the pathway works correctly. These are sufficient for
  correctness; S3 integration numbers are a secondary concern until
  gas exchange is fixed.

Per the project principle ("Don't rehack S3 — if the rate lands in
band, great; if not, analyze and report"), we prefer honest reporting
over fitting.

## Notes

- Removing `wasteRatio` is a net simplification: it was always a
  disguised N-accounting coefficient (with only the metabolism system
  consuming it). Making N content explicit replaces one opaque knob
  with two that have direct biological meaning and independent
  defensible defaults.
- `foodNitrogenFraction = 0.05` is the engine's pre-existing
  assumption, embedded in `wasteToAmmoniaRatio = 60`. Surfacing it as
  config makes that coupling explicit and allows joint calibration in
  the future (if N-content is revised, both values move together).
- If S3 still undershoots after this fix, the remaining gap likely
  lies in: (a) `foodNitrogenFraction` being conservative (real flake
  food is 6–8 % N), or (b) bacteria carrying capacity limiting NH3
  clearance in the high-flux regime. Both are follow-ups.

## S3 verification (synthetic, respiration-override workaround)

Ran S3 community (150 L, 10 neon tetra × 0.5 g, 0.5 g food/day) with
`baseRespirationRate = 0.0001` (≈200× lower than default) to avoid the
O2 crash, bootstrapped mature cycle (NO3 = 24 ppm, AOB/NOB at 20 % of
cap), 6 days. Script: `calibration-tmp/s3-live-fish-probe.ts` (scratch
scaffolding, gitignored directory).

| Day | NO3 ppm | Daily Δ |
|---|---|---|
| 0 | 24.00 | — |
| 1 | 24.73 | +0.73 |
| 2 | 25.70 | +0.97 |
| 3 | 26.92 | +1.22 |
| 4 | 28.00 | +1.08 |
| 5 | 29.10 | +1.10 |
| 6 | 30.23 | +1.13 |

**Rise rate ≈ 1.04 ppm/day vs. target band 2.5–3.5.** Still below band,
but this is not an engine issue — it's the S3 scenario anchor being
internally inconsistent with stoichiometry:

- 10 × 0.5 g fish ≈ 5 g of fish biomass. At default hunger dynamics
  they saturate quickly and eat ~0.18 g/day of the 0.5 g feeding; the
  remaining 0.32 g goes through the food-decay path.
- Direct gill NH3: 0.18 g × 5 % × 80 % × (17.03/14.01) × 1000 ≈
  8.8 mg NH3/day.
- Feces waste (new): 0.18 × 0.2 × 60 ≈ 2.2 mg NH3/day.
- Food decay → waste → NH3: 0.32 × 0.4 × 60 ≈ 7.7 mg NH3/day.
- Ambient waste: 0.01 × 24 × 60 ≈ 14.4 mg NH3/day.
- Total NH3 in ≈ 33 mg/day → × 3.64 MW chain → 120 mg NO3/day →
  /150 L ≈ 0.80 ppm/day asymptotic.

Observed 1.04 ppm/day is consistent with the asymptote plus bootstrap
transients. Per Task 26's analysis, closing the gap to 2.5 ppm/day
would require ~3× the N input — the scenario either needs heavier
feeding (≈1.5 g/day) or more fish. The 2.5–3.5 figure in the anchor
was set under the old 1:1 compound-mass stoichiometry and is now
physically unreachable at the stated bioload.

Per the project principle, reporting as-is rather than tuning to fit.

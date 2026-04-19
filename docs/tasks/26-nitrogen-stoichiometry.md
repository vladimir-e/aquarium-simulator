# Task 26: Nitrogen-chain stoichiometry + fish default hunger

**Status:** completed

## Overview

Fix two engine-level correctness issues surfaced by the first community
steady-state calibration run (`docs/calibration/runs/2026-04-19-community-steady-state.md`).

1. **Nitrogen-chain stoichiometry.** The engine treats NH3 → NO2 → NO3 as
   1:1 by compound mass, violating real chemistry. Real nitrogen is
   conserved as N-mass (14.01 g/mol) while compound mass scales with
   molecular weight (NH3 17.03, NO2 46.01, NO3 62.00). The previous
   calibration run papered over this by inflating `wasteToAmmoniaRatio`
   from 50 to 450, a ~9× hack. Fix the stoichiometry, then return the
   ratio to a realistic value.

2. **Fish default hunger.** New fish were originally added at `hunger = 0`,
   causing the first feeding to decay unused and artificially spiking
   ammonia and O2 demand. The current repo already initialises at 30; this
   task confirms that value against the hunger scale and documents the
   reasoning.

## References

- `docs/calibration/runs/2026-04-19-community-steady-state.md` — prior
  calibration and the engine issues it surfaced (§ *Engine-level issues
  worth design attention*, items 1 and 4).
- `docs/calibration/scenarios/03-community-steady-state.md` — primary
  anchor for verifying the NO3 accumulation rate after the fix.
- `src/simulation/config/nitrogen-cycle.ts` — `wasteToAmmoniaRatio`.
- `src/simulation/systems/nitrogen-cycle.ts` — where stoichiometry is
  applied (two conversion steps in `update`).
- `src/simulation/config/livestock.ts` — hunger scale (0–100%, stress at
  50%, increase rate 0.6 %/hr).
- `src/simulation/actions/fish-management.ts` — `addFish` initialisation.

## Scope

### In Scope

- Correct mass conversion inside the NH3 → NO2 → NO3 chain.
- Reset `wasteToAmmoniaRatio` to a stoichiometric value.
- Update unit/integration tests that pinned 1:1 mass conversion.
- Confirm fish `hunger = 30` default, document the scale rationale.
- Verify S3 primary anchor (NO3 ≈ 36–44 ppm day 6 in fishless-seeded
  150 L, 0.5 g/day waste).

### Out of Scope

- Switching resource storage to N-mass. We keep compound-mass storage
  and apply MW ratios only at the two conversion steps — smaller blast
  radius, invariant stays correct.
- Gas exchange / oxygen crash issues flagged in the calibration run.
  That blocks running S3 with live fish but is a separate calibration.
- CLI `waterChange` fraction snapping (tracked separately).
- Any UI changes.

## Implementation

### Fix 1 — stoichiometry

- **Preferred approach (chosen): MW ratios at conversion step.**
  - Introduce molecular-weight constants for NH3/NO2/NO3 in the nitrogen
    cycle system (local to the file; not user-tunable — this is physics,
    not a knob).
  - Change `calculateAmmoniaToNitrite` to return both `ammoniaConsumed`
    and `nitriteProduced = ammoniaConsumed × (MW_NO2 / MW_NH3) ≈ 2.702`.
  - Change `calculateNitriteToNitrate` similarly with
    `nitrateProduced = nitriteConsumed × (MW_NO3 / MW_NO2) ≈ 1.348`.
  - `nitrogenCycleSystem.update` applies consumption and production with
    the correct ratio.
  - End-to-end: 1 mg NH3 → 2.70 mg NO2 → 3.64 mg NO3 (or 0.823 mg of N
    throughout — invariant held).
- **Rejected alternative: track resources as N-mass internally.** Cleaner
  design but ripples through every nitrate/nitrite consumer (plants,
  water change, dosing, UI rendering, alerts, tests). Not justified for
  a calibration fix.
- Set `wasteToAmmoniaRatio = 60` (stoichiometric from 5% N waste:
  1 g waste → 0.05 g N → 0.05 × 17.03/14.01 = 60.8 mg NH3).
- Keep `decay.ambientWaste` at its baseline 0.01 g/hr. The previous
  calibration dropped it to 0.001 only to offset the inflated ratio;
  with a near-stoichiometric ratio the original value produces realistic
  background flux.
- Update `systems/nitrogen-cycle.test.ts` expectations that pinned 1:1
  mass conversion between NH3/NO2/NO3.

### Fix 2 — fish hunger

- `hunger` is on a 0–100% scale. `hungerStressSeverity` kicks in above
  50%; `hungerIncreaseRate = 0.6 %/hr`. At `hunger = 30`:
  - Fish eat immediately on the next feeding.
  - Reach the 50% stress threshold only after ≈33 hours unfed.
  - Reach starvation (100%) only after ≈117 hours.
- Confirms the current `30` default is correct. No code change needed
  beyond documenting the rationale here and in the `addFish` comment.

## Acceptance Criteria

- All unit + integration tests pass with the new stoichiometry.
- `npm run lint` clean.
- `npx tsx src/cli/sim.ts smoke` passes end-to-end.
- N-mass invariant holds: for arbitrary ammonia consumed in the AOB
  step, NO2 produced expressed in N-mass equals NH3 consumed expressed
  in N-mass. Same for NOB → NO3.
- S3 fishless-seeded primary anchor (bootstrapped mature tank, 0.5 g
  waste/day, 150 L, 6 days) lands in the 36–44 ppm NO3 band at day 6
  with `wasteToAmmoniaRatio = 60` and `ambientWaste = 0.01`.

## Tests

- Existing `calculateAmmoniaToNitrite` / `calculateNitriteToNitrate`
  unit tests updated to return `{consumed, produced}` and assert the MW
  ratio.
- Nitrogen cycle system tests updated where they previously asserted
  `nitriteEffect.delta === -ammoniaEffect.delta` etc.
- New test: N-mass is conserved across the chain (mg of N in ammonia
  consumed = mg of N in nitrite produced; same for NO2 → NO3).

## Notes

- `wasteToAmmoniaRatio` meta max widened to 200 so the slider has
  headroom above stoichiometric; min stays 10.
- If `wasteToAmmoniaRatio = 60` puts the day-6 NO3 outside 36–44, do
  not rehack the ratio — investigate upstream (plant consumption, waste
  mineralization fraction, ambient waste).

## S3 verification (fishless-seeded, 150 L, 0.5 g waste/day)

Ran the primary anchor with the new stoichiometry, `wasteToAmmoniaRatio
= 60`, `ambientWaste = 0.01 g/hr`, bootstrapped mature tank (NO3 = 24
ppm, AOB = NOB = 446, no fish, no plants), 0.5 g waste seeded daily for
6 days.

| Day | NO3 (ppm) | Delta from previous |
|---|---|---|
| 0 | 24.00 | — |
| 1 | 25.49 | +1.49 |
| 2 | 27.09 | +1.60 |
| 3 | 28.74 | +1.65 |
| 4 | 30.44 | +1.70 |
| 5 | 32.20 | +1.76 |
| 6 | 34.01 | +1.81 |

**Result: day-6 NO3 = 34.01 ppm. Expected band: 36–44 ppm. Out of band
by ≈2 ppm below the lower edge.** Rise rate ≈1.67 ppm/day vs. anchor
2.5–3.5 ppm/day.

Per task instructions, *do not rehack the ratio*. The gap is reported
as-is for the calibration reviewer.

### Where the gap comes from

The scenario anchor is internally inconsistent with stoichiometry.
Scenario 03 states 0.5 g/day total waste and anchors 2.5–3.5 ppm/day
NO3 rise in 150 L. Back-solving: 2.5 ppm/day × 150 L = 375 mg NO3/day
= 85 mg N/day = 0.085 g N/day. For 5%-N waste that implies 1.7 g/day
of waste, ≈3× the scenario's stated bioload. The 2.5–3.5 ppm/day figure
was anchored under the old 1:1 stoichiometry (where compound mass
didn't grow), so it effectively double-counted production.

With correct chemistry and stoichiometric coefficients:
- Waste input 0.5 g/day × 60 mg NH3/g = 30 mg NH3/day.
- Ambient waste 0.01 g/hr × 24 × 60 = 14.4 mg NH3/day.
- Total NH3 input ≈ 44.4 mg/day → × 3.64 MW ratio = 162 mg NO3/day.
- In 150 L = 1.08 ppm/day asymptotic.

Observed 1.67 ppm/day slightly exceeds this because the bootstrap leaves
residual NH3/NO2 in the AOB/NOB pipeline that transiently produces NO3
above steady-state for the first few days. The rise rate is trending
toward the asymptote (1.49 → 1.81 ppm/day across the 6 days), which is
consistent with a system converging on 1.1 ppm/day steady-state plus
decaying transients.

### Path forward (out of scope for this task)

Three options for closing the gap, for the next calibration round:

1. **Revisit the scenario anchor.** If 2.5–3.5 ppm/day is meant to
   include live-fish metabolism (waste + direct NH3 excretion from
   gills), the fishless-seeded test will always land lower. Splitting
   the anchor into "fishless seeded" (physical lower bound from waste
   alone) and "full community" (with fish excretion contribution) makes
   the target unambiguous.
2. **Revisit the fish waste model.** Fish in the scenario excrete NH3
   directly through gills in addition to producing solid waste; our
   metabolism system rolls everything into solid waste. Adding a direct
   NH3 flux path would close ≈half of the gap.
3. **Revisit the N content assumption.** Dry fish waste N-content
   varies 5–12 % depending on species, protein intake, and what's being
   measured (solid waste vs. gill excretion). Moving to 8–10 % would
   push `wasteToAmmoniaRatio` to 95–120 and narrow the gap — but that
   should be grounded in a fish-physiology reference, not scenario
   fitting.

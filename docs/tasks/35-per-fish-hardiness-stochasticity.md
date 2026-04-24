# Task 35: Per-fish hardiness stochasticity

**Status:** completed

## Overview

Right now every fish of a given species is identical — same mass, same
starting health, same hardiness. When conditions degrade to the lethal
threshold, all individuals of a species die in the same tick. Scenarios
01 (uncycled quarantine) and 04 Variant B (10 tetras in 5 gal) both
expose this: the expected behaviour is staggered deaths over 1–2 days
as the weaker individuals fail first, but the engine produces a single
mass-death tick.

Real aquarium populations show meaningful variation in hardiness —
younger fish are more sensitive, some individuals carry parasite load,
body condition at purchase varies. A small amount of per-individual
jitter would reproduce the staggered-failure signal without adding any
new stress mechanics.

## References

- Scenarios: `docs/calibration/scenarios/01-uncycled-quarantine.md`,
  `docs/calibration/scenarios/04-low-volume-stressors.md` (Variant B)
- Engine: `src/simulation/actions/fish-management.ts` (addFish),
  `src/simulation/systems/fish-health.ts` (calculateStress)
- Config: `src/simulation/state.ts::FISH_SPECIES_DATA`
- Related calibration run:
  `docs/calibration/baselines/04-low-volume-stressors.md`

## Scope

### In scope

- Per-fish hardiness offset applied at `addFish`. Apply at ±15 % of
  species baseline, drawn from a truncated normal (or uniform for
  simplicity).
- Optional: per-fish initial health (±5 %) to capture mild purchase-
  condition variation.

### Out of scope

- Per-fish food efficiency, growth rate, or species-specific behaviour.
- Sex-linked variation (sex is already tracked but currently cosmetic).
- Anything that persists across save/load beyond the existing fish
  schema additions.

## Design

Add a `hardinessOffset` field to `Fish` state. `addFish` samples a
random offset per individual and stores it. `calculateStress` then
uses `speciesData.hardiness + hardinessOffset` instead of the bare
species value, clamped to [0.1, 0.95].

```ts
// in addFish
const offset = (Math.random() - 0.5) * 2 * 0.15 * speciesData.hardiness;

// in calculateStress
const effectiveHardiness = Math.max(
  0.1,
  Math.min(0.95, speciesData.hardiness + fish.hardinessOffset)
);
```

Offset is stored per-fish rather than derived each tick so the same
individual fails consistently (not re-rolled every tick).

## Acceptance criteria

- Scenario 01: first death lands in the existing acceptance band
  (days 6–8), and subsequent deaths stagger over the following day
  rather than all happening in one tick.
- Scenario 04 Variant B: first death day 4–5, mass die-off by day 7,
  but spread over at least 4 separate ticks.
- Persistence schema version bumped and migration tested.
- No regression in smoke test or baseline calibrations — jitter is
  ±15 %, should not move scenario-level anchors.

## Notes

This is a small, self-contained change that would materially improve
the "realism feel" of mass die-off events in the game UI. Low-risk,
high perceived-quality gain.

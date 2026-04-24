# Task 39: Plant propagation and tank plant capacity

**Status:** pending

## Overview

Plants in the current engine never reproduce. A thriving Anubias just
keeps adding biomass to its single specimen forever. In real planted
tanks, mature healthy plants propagate — Anubias splits at the
rhizome, Amazon Sword sends out runners with daughter plants, Java
Fern sprouts plantlets on its leaves. This is the core reward loop on
the plant side: keep a plant happy long enough and the tank rewards
you with a new specimen.

The mechanic also gives the game a tangible payoff for good husbandry
that complements (and is naturally bounded by) Task 34's competition
and Task 38's biomass cap.

## References

- Specs: `docs/6-PLANTS.md` — add a new "Propagation" section
- Engine: `src/simulation/plants/index.ts`,
  `src/simulation/state.ts` (`PLANT_SPECIES_DATA`, `Tank`),
  `src/simulation/systems/plant-growth.ts`
- Related tasks: 34 (overgrowth + competition), 38 (trim + biomass
  cap). Soft prerequisites — propagation feels right once both have
  landed, but the engine pieces are independent and could be built
  earlier if needed.

## Scope

### In scope

- New `propagationStyle` field on `PlantSpeciesData`: `'carpet' |
  'stem' | 'crown'`.
- New tank-level `plantCapacity` field (integer; UI renders as
  slots). v1 derivation: `floor(volume_L / 10)` with a minimum of 2.
  Configurable later.
- Per-plant `propagationProgress` (0–100) on `Plant` for crown
  species. Surfaced in plant inspector UI.
- Per-species `propagationRate` (progress per tick) — calibrated to
  real timelines (see Implementation).
- Autonomous propagation gate: mature + thriving + free capacity →
  accumulator advances; otherwise gentle decay (× ~0.98 per tick).
- Spawn behaviour: at progress ≥ 100 and free capacity, spawn a new
  plant of the same species (size 15 %, condition 80 %, progress 0)
  and reset the parent's progress to 0.
- Carpet plants occupy capacity but never propagate autonomously.
- Stem plants occupy capacity but never propagate in the sim. Their
  trim-driven propagation (≥ 30 % trimmed → new specimen) is a
  game-layer concern, not engine-side.

### Out of scope

- The stem-trim → new-plant rule (game side, not sim).
- Inventory / "held plants" concept (game side).
- Cross-pollination, hybridisation, genetics.
- Spatial layout of slots inside the tank — capacity is a scalar.
- Substrate-aware spawn rules (a sword shouldn't propagate into a
  bare-bottom tank). Treat as a follow-up; v1 ignores substrate at
  spawn time.
- Auto-removal of propagated plants when capacity is full at spawn
  time — instead, the gate prevents progress from accumulating, so
  the situation never arises.

## Implementation

### Species metadata

Add to `PlantSpeciesData`:

```ts
propagationStyle: 'carpet' | 'stem' | 'crown';
/** Progress per tick when mature + thriving + free capacity. Crown only. */
propagationRate: number;
```

Initial assignments (calibrate to in-game days; 1 tick = 1 hour):

| Species          | Style  | Real timeline   | Rate ≈ 100 / (days × 24) |
|------------------|--------|-----------------|--------------------------|
| Anubias          | crown  | ~100 days       | ~0.042                   |
| Java Fern        | crown  | ~50 days        | ~0.083                   |
| Amazon Sword     | crown  | ~30 days        | ~0.139                   |
| Monte Carlo      | carpet | n/a             | 0                        |
| Dwarf Hairgrass  | carpet | n/a             | 0                        |

Stem species don't exist yet; when added, set `propagationStyle:
'stem'` and `propagationRate: 0`.

### Tank state

Add `plantCapacity: number` to `Tank`. Derive on tank creation
(`floor(volume_L / 10)`, min 2). Plant occupancy = current plant
count regardless of style. `freeCapacity = plantCapacity -
plants.length`.

### Per-plant state

Add `propagationProgress: number` (0–100, default 0) to `Plant`.
Persists across ticks. Only mutated for crown species.

### Tick logic (new system or fold into plant-growth)

Per crown-style plant, after photosynthesis and condition update:

```
mature  = plant.size >= 80
thriving = plant.condition >= 80 && nutrientSufficiency >= 80
hasSlot = freeCapacity > 0

if mature && thriving && hasSlot:
    progress += species.propagationRate
else:
    progress *= 0.98   // visible decay; surfaces as "slowing" in UI

if progress >= 100:
    spawnPlant(species, size=15, condition=80, progress=0)
    progress = 0
    emit log: 'plant-propagated'
```

Order matters within a tick: evaluate all parents against the
*pre-spawn* `freeCapacity`, then apply spawns. A parent that
propagates this tick consumes the slot; subsequent parents in the
same tick see the reduced capacity. (Deterministic iteration order
over `plants` is fine.)

### Spawn semantics

- New plant inherits `species`, gets a fresh id, size 15, condition
  80, progress 0.
- No substrate compatibility check in v1 — any free capacity in the
  tank accepts the spawn. Document the limitation.
- Inserted at the end of `state.tank.plants`.

### Logging

Emit a `plant-propagated` log entry (severity: info) — parent id,
species, new plant id. This is one of the genuinely positive game
events, worth surfacing in the activity log.

### UI pointers

- Plant inspector: progress bar for crown-style plants, with a state
  label — `"73 % to next plantlet"`, `"slowing — tank is full"`,
  `"slowing — not thriving"`.
- Tank header: small slot indicator (`"4 / 6 plant slots"`).
- Activity log: highlight propagation events (positive feedback).

## Acceptance criteria

- A 60 L tank with one mature thriving Anubias and free capacity
  produces a new Anubias within ~100 in-game days, ±20 %.
- A 60 L tank at full capacity does not propagate; progress
  accumulates to a small value then decays as conditions vary.
- A struggling Anubias (condition < 80) accumulates no progress; a
  brief dip causes mild decay, not a hard reset.
- Carpet and stem species never auto-propagate regardless of
  condition.
- New `plantCapacity` is set on tank creation; `freeCapacity`
  reflects current plant count correctly across propagation events.
- No regression in calibration scenarios 01–04 (their windows are
  short enough that no autonomous propagation should fire; verify
  baselines unchanged).

## Tests

- Unit: accumulator advances only when all three gates pass; decays
  multiplicatively otherwise.
- Unit: spawn at progress ≥ 100 produces a child with correct
  defaults, resets parent progress, increments plant count.
- Unit: capacity gate blocks accumulation when tank is full.
- Unit: carpet and stem species never accumulate progress.
- Integration: long-run scenario (one Anubias, ideal conditions, 60 L
  tank, 120 days) produces exactly one propagation event in the
  ~100-day window.
- Integration: same setup with capacity 1 (no free slot) produces no
  propagation events.

## Notes

This is the plant-side reward mechanic; the fish side (Task 35
hardiness stochasticity, plus eventual fish breeding) will mirror it
later. The accumulator-with-decay shape is deliberate — it forgives
a single bad tick (ammonia spike, missed dose) but punishes sustained
neglect, which matches the real hobbyist experience.

The 30 %+ trim → new stem-plant rule lives in the game layer, not
the sim. The sim's trim action (Task 38) just reduces size with no
waste. The game can inspect the trim event and synthesise a new
plant from the trimmed material.

Substrate-aware spawn is a known v1 gap — an Amazon Sword shouldn't
propagate into bare glass. Track as a follow-up once Task 37
(substrate leaching) lands and we have a richer substrate model.

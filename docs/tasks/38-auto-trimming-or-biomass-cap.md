# Task 38: Auto-trimming or biomass cap for plants

**Status:** pending

## Overview

Plants in the current engine have no upper bound on growth. A stem
plant with adequate light and nutrients will keep increasing `size`
every tick forever. In real tanks, plants either stop at a physical
ceiling (hit the water surface, run out of horizontal substrate) or
get trimmed by the hobbyist. Without one of those mechanisms, a
long-running game eventually produces unbounded biomass — visually
absurd and physically nonsensical.

This is the natural complement to Task 34 (plant overgrowth and
competition): overgrowth is the *problem*, this task is the *relief
valve*.

## References

- Specs: `docs/6-PLANTS.md` (growth model)
- Engine: `src/simulation/systems/plant-growth.ts`,
  `src/simulation/plants/index.ts`
- Related task: `34-plant-overgrowth-competition.md`

## Scope

### In scope

- At least one of the two options below (A or B), possibly both.
- Trim action — a user (or auto-scheduler) can remove a fraction of
  a plant's size. Trimmed material exits the system (not added to
  waste), per `docs/6-PLANTS.md` § Trimming.
- Surface biomass cap — plants can't exceed a max size proportional
  to the tank's footprint or water column height.

### Out of scope

- Fine-grained leaf-level modelling. Keep growth scalar on `size`.
- Physical positioning of plants in the tank (front / back / carpet).

## Design options

**Option A — Biological cap (species-level max size)**

Each plant species has a `maxSize` in `PLANT_SPECIES_DATA`. Growth
rate asymptotically decays as `size` approaches `maxSize`:

```
growth_rate_effective = base_rate × (1 - size / maxSize)
```

Simple, self-contained, physically grounded (plants at max size
photosynthesise for maintenance but don't grow). No user action
required.

**Option B — Auto-trim action**

Mirror the existing `scrubAlgae` action: `trimPlants` removes X % of
size from one or all plants. Trimmed material exits the system — no
waste added (the hobbyist throws it out or replants elsewhere; the
game-side stem-propagation rule will hook in here later, but that
lives outside the sim). Optionally schedule on a cadence (weekly-ish,
per plant's growth rate) for auto-managed tanks.

Explicit user agency (the trim is a choice, not a silent cap). Good
for the game UX — "time to trim" is a real hobbyist moment.

**Option C — Both**

Soft biological cap (B) per species AND a user-triggered trim action
(A) for hobbyist feel. This is what real tanks do: plants *could*
keep growing past a natural endpoint, but the hobbyist intervenes
to maintain aesthetic.

## Recommended path

Option C, in phases:
1. Add `maxSize` metadata and asymptotic growth — gets the unbounded-
   biomass bug fixed on day one.
2. Add `trimPlants` action — gives the UI / game something to do.
3. Add optional auto-trim scheduler — tie to a future
   "auto-maintenance" game mode.

## Acceptance criteria

- A 40gal community with 5 Java Ferns run for 6 months stabilises
  biomass rather than growing unbounded.
- Trim action reduces plant size; trimmed material exits the system
  (no waste added), matching the existing spec in `docs/6-PLANTS.md`.
- No regression in current scenarios' primary anchors — plants in
  scenarios 01 / 02 / 03 / 04 never approach their `maxSize` within
  the test windows, so the asymptotic term should be effectively 1.0
  during calibration runs.

## Notes

Also non-blocking follow-up. Calibration scenarios 01–04 are short
(days to weeks) and don't approach biomass limits, so the gap doesn't
surface in any current baseline. It shows up in longer-running game
sessions.

Pair with Task 34 (overgrowth competition) — Task 34 establishes
*why* plants would stop growing (shading, nutrient competition), this
task adds the *relief valve* (cap or trim) for situations where those
mechanisms don't fire.

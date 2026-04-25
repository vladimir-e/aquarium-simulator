# Task 40: Vitality model — unified damage/benefit/condition for plants and fish

**Status:** completed

## Overview

Both plants and fish need a shared "vitality" concept: a tick-by-tick
balance between damage rate (from stressors) and benefit rate (from
favorable conditions) that drives a `condition` (0–100%) value, with
any surplus available for the organism to spend on growth, breeding,
or other lifecycle behavior.

Today plants and fish are split:
- **Fish** have a stressor-based health model (`fish-health.ts`) but
  no benefit-rate concept and a flat `baseHealthRecovery = 1 %/h`
  regardless of how good conditions are. There is no "surplus" path —
  health is a state, not a trajectory.
- **Plants** have a `condition` stat that's driven *only* by nutrient
  sufficiency (Liebig minimum across NO3/PO4/K/Fe). Light, CO2, pH,
  temperature, flow are not wired into condition at all. Worse,
  growth bypasses condition entirely: `distributeBiomass` runs against
  raw photosynthesis output, never gated by health.

The bug this exposes: a tank can hit 200%+ plant biomass, lose CO2,
be massively overdosed by an auto-doser, and the UI still labels every
plant "Thriving." Condition reads 100% because nutrients are saturated;
biomass doesn't shrink because nothing decays it; growth has slowed
to zero because photosynthesis is CO2-gated, but that's invisible.

## Concept

A single pure module computes vitality for any organism:

```
input: { stressors[], benefits[], hardiness, condition }
  damageRate  = Σ stressor severities (each scaled by hardiness)
  benefitRate = Σ benefit severities
  net         = benefitRate − damageRate

  if net < 0:                    newCondition = condition + net   (clamp ≥0)
  if net > 0 and condition <100: newCondition = min(100, condition + net)
                                 surplus = 0
  if net > 0 and condition ==100: newCondition = 100
                                 surplus = net

output: { newCondition, surplus, breakdown }
```

The vitality module is **agnostic about where surplus goes**.
Organism-specific code decides:
- Plants → surplus drives biomass production via `distributeBiomass`.
- Fish → surplus is captured on state but unused for now (future:
  breeding readiness, juvenile→adult progression, longevity bonus).
- Future colonies / algae lifeforms → free to allocate as appropriate.

## In scope

### Vitality engine (new)

- New module `src/simulation/systems/vitality.ts`.
- `computeVitality(input) → { newCondition, surplus, breakdown }`.
- Pure, framework-free, no Immer. Returned `breakdown` is the
  per-factor list (name + ±%/h) that UI components render.
- Unit tests covering: net-negative decline, net-positive recovery
  while sub-100, surplus capture at 100, hardiness scaling,
  empty-input case, clamping at 0.

### Factor configuration shape

Each factor is one of three shapes (each species can override):
1. **Pure stressor** — damage at any presence (NH3, NO2). Never a
   benefit.
2. **Two-sided around ideal** — temperature, pH, light, CO2. Damage
   when too low or too high; benefit near species ideal. Configured
   with `optimalRange`, `tolerableRange`, severity per side.
3. **Benefit with toxicity ceiling** — nutrients (NO3, PO4, K, Fe).
   Benefit across a wide band; stress only at gross excess (auto-
   doser scenario).

Implementations choose the math (linear ramp, gaussian, piecewise
linear). Keep it tunable; this task is the architecture, calibration
will follow.

### Plant rewrite

- New `calculatePlantStressBreakdown(plant, resources, env, species) →
  PlantBreakdown` mirroring `calculateStressBreakdown` for fish.
- Plant **stressors** (each gated by species config; not all species
  trigger every channel):
  - Light insufficient
  - Light excessive (high-light burns shade species)
  - CO2 insufficient (high-tech species)
  - Temperature out of range
  - pH out of range
  - Nutrient deficiency × 4 (NO3, PO4, K, Fe)
  - Nutrient toxicity at gross overdose (the auto-doser case; route
    through NH3/EC if cleaner, otherwise direct toxicity stressor)
  - Algae shading (when algae density is high)
- Plant **benefits**:
  - Light in optimal band
  - CO2 in optimal band
  - Nutrients sufficient and balanced
  - Temperature near species optimum
  - pH near species optimum
- Per-species `hardiness` field in `PLANT_SPECIES_DATA` (Anubias high,
  Monte Carlo low).
- Plant pipeline: photosynthesis still computes a potential biomass,
  but the actual biomass added is `surplus`-gated. If condition < 100,
  no growth; surplus only flows to `distributeBiomass` once condition
  is full.

### Fish migration

- Replace ad-hoc health math in `fish-health.ts` with a call into
  `computeVitality`. Existing nine stressors keep their severities.
- Add fish **benefits** for: temperature near optimum, pH near
  optimum, hunger satisfied, oxygen plentiful. Tuned so existing
  calibration scenarios remain within their primary anchors —
  benefit rate at "good" conditions should approximate the current
  flat 1 %/h recovery so we don't break the four canonical baselines.
- Surplus is computed and stored on fish state (`fish.surplus` or
  similar) but not yet consumed. Future tasks (breeding, growth) will
  read it.

### UI parity

- `PlantCard` gets the collapsible `▶ Stressors (N)` block matching
  `FishCard` ([Livestock.tsx:217](../../src/ui/components/panels/Livestock.tsx)).
- Same expand/collapse pattern, same red stressor-line styling
  (`Light  +0.5 %/h`).
- ↑/↓ trend arrow on plant condition matching fish health.
- Decision: separate `▶ Benefits (N)` block, or merged
  `▶ Conditions (N)` view with green benefits and red stressors.
  Recommend merged — keeps the card compact and tells the full story
  in one place.

### Configuration

- New `PLANT_STRESSOR_CONFIG` parallel to `LIVESTOCK_STRESSOR_CONFIG`.
- Extend `PLANT_SPECIES_DATA` with: `optimalLight`, `tolerableLight`,
  `optimalCO2`, `tolerableCO2`, `optimalTemp`, `tolerableTemp`,
  `optimalPH`, `tolerablePH`, `hardiness`. Use existing real-world
  ranges where possible.
- All severities tunable in one place; calibration discipline matches
  the rest of the engine.

## Out of scope

- Plant overgrowth + interspecies competition (Task 34) — will plug
  into this stressor framework once it lands. Self-shading naturally
  expresses as a "light insufficient" stressor for shaded plants.
- Fish breeding — will consume surplus when implemented.
- Auto-trim / biomass cap (Task 38) — will exploit surplus naturally
  curving to zero as size approaches max.
- Substrate leaching (Task 37).
- Plant propagation (Task 39).

## Design decisions

(Locked during architecture brainstorm with Vlad — do not relitigate.)

1. **Vitality module is organism-agnostic about surplus.** It returns
   surplus as a number; the organism module decides how to spend it.
2. **Surplus-overflow growth, not multiplicative.** Growth happens
   only when condition is at 100. A stressed organism does not crawl
   forward at a fraction of its rate; it heals first. This produces
   the clean "recover, then grow" trajectory that matches reality.
3. **Hardiness multiplies all stressors.** Per-species, plants and
   fish.
4. **Benefit rate is real, not a constant.** Recovery scales with
   how good conditions are. A perfect tank heals fast; a marginal
   tank barely holds steady.

## Acceptance criteria

- Vitality module has standalone unit tests covering all four
  state transitions (decline, recovery, surplus capture, clamping).
- Fish behavior on the four canonical calibration scenarios stays
  within existing tolerance (uncycled quarantine, planted
  equilibrium, community steady-state, low-volume stressors).
- New plant scenario: a high-tech tank (Monte Carlo + Amazon Sword +
  Anubias) loses CO2 — Monte Carlo declines visibly within ~24 sim
  hours, Amazon Sword declines slower, Anubias is stable. Ranking
  matches species hardiness and CO2 demand.
- New plant scenario: gross nutrient overdose triggers a visible
  toxicity stressor on plant cards and condition trends downward.
- A stressed plant whose conditions are corrected regains condition
  to 100% before any biomass increase resumes.
- UI: plant cards show stressor breakdown matching fish-card pattern,
  with ↑/↓ trend arrow.
- Spec docs (`docs/6-PLANTS.md`, `docs/7-LIVESTOCK.md`) updated to
  describe the vitality model.

## References

- Specs: `docs/6-PLANTS.md`, `docs/7-LIVESTOCK.md`
- Fish health (current): `src/simulation/systems/fish-health.ts`
- Plant condition (current): `src/simulation/systems/nutrients.ts`
  (`updatePlantCondition`, `calculateNutrientSufficiency`)
- Plant growth (current): `src/simulation/systems/plant-growth.ts`
  (`distributeBiomass`)
- Plants orchestration: `src/simulation/plants/index.ts`
- Livestock orchestration: `src/simulation/livestock/index.ts`
- Config: `src/simulation/config/livestock.ts`,
  `src/simulation/config/nutrients.ts`,
  `src/simulation/config/plants.ts` (locate plant species data)
- UI fish stressor block:
  `src/ui/components/panels/Livestock.tsx` (FishCard, ~line 217)
- UI plant card: `src/ui/components/panels/Plants.tsx` (~line 186)
- Related tasks: 34 (overgrowth/competition — will plug into stressor
  framework), 38 (biomass cap — will exploit surplus curve)

## Implementation notes

This refactor touches engine + config + UI and risks calibration
drift. Recommend a single feature branch with three commits, each
leaving the build green:

1. **Vitality module + tests** — pure, no integration yet.
2. **Fish migration** — route fish-health through vitality, add fish
   benefits, verify calibration scenarios still pass.
3. **Plant rewrite + UI** — new stressor breakdown, new species
   config, growth gated by surplus, plant card UI.

Each step is independently reviewable and reverts cleanly if a later
step exposes a problem.

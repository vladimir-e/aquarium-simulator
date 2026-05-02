# Task 42: Algae as a living organism — vitality, mass, and plant competition

**Status:** completed

## Overview

Algae is currently a single number on `Resources.algae` (0–100), grown by
a Michaelis-Menten curve on watts per liter, dampened by total plant
size, boosted by excess nutrients. It does not use the vitality engine.
It does not decay. It cannot die back without scrubbing. It is not a
peer of plants and fish in the simulation's mental model — it is a
chemistry-style stock.

This task promotes algae to a **living organism**: its own state shape
on `SimulationState`, its own stressor/benefit set running through the
shared vitality engine, surplus-driven mass growth, and condition-driven
mass decay. The promotion sets the architectural template for future
"mass-based organisms" (e.g. snail / shrimp colonies — Task TBD), where
the entity is one population rather than per-individual specimens.

The redesign also expresses the gameplay loop that crystallised in late
April: **stack positives, fix negatives.** A thriving planted tank
should suppress algae continuously; a neglected tank should let it
bloom. Today algae is decoupled from the rest of the vitality system,
which makes that loop muted: the player can't *see* why algae is
growing or shrinking, only the level. After this task, the algae card
will list the same kind of conditions breakdown that plant and fish
cards do, and the levers (CO2, plants, dosing) will register visibly
on it.

## Concept

### State shape

Remove `algae` from `Resources`. Add a top-level field:

```ts
state.algae: AlgaeState

interface AlgaeState {
  /** Aggregate biomass / coverage 0–100 (same scale as today). */
  mass: number
  /** Vitality 0–100. Drives surplus and mass-decay rate. */
  condition: number
  /** Banked surplus emitted by vitality once condition === 100. */
  surplus: number
}
```

Initialised to `{ mass: 0, condition: 100, surplus: 0 }`. Condition
starts at 100 because there's no algae yet — vitality is meaningful
only once mass > 0, but keeping condition full from t=0 is cleaner than
special-casing the empty case.

**No `Resources.algae` shim, no compatibility export.** Per project
principles: clean removal, no legacy.

### Vitality integration

Algae feeds the same `computeVitality` engine plants and fish use.
A new builder `src/simulation/systems/algae-vitality.ts` produces
stressors and benefits each tick. Algae has a single `hardiness` value
in config (no per-species variation yet).

Stressors and benefits are listed below. All severity coefficients live
in a new `src/simulation/config/algae-vitality.ts` and are tuned for
mechanism only — calibration is a follow-up.

### Stressors

| Key | Trigger | Severity model |
|---|---|---|
| `plant_suppression` | `plantPower > suppressionThreshold` | `plantSuppressionSeverity × (plantPower − suppressionThreshold)` |

`plantPower` reuses the formula already in
`fish-health.ts`'s plant-benefit builder:

```ts
plantPower = Σ over plants of (plant.size / 100) × (plant.condition / 100)
```

That gives one number that captures plant biomass *and* plant health.
A tank with thriving large plants suppresses algae; a tank where plants
are dying does not. This is the architectural payoff of putting algae
into vitality: the same primitive feeds both fish-benefit and
algae-stressor without duplication.

There is intentionally no direct CO2 stressor on algae. CO2 affects
algae indirectly via plant condition (CO2-fed plants thrive → high
plantPower → algae suppressed). Same for ammonia, light, and any
other plant-side input. Plant condition is the meta-signal.

### Benefits

| Key | Trigger | Magnitude |
|---|---|---|
| `excess_light` | `light > lightExcessThreshold` (W/L) | `excessLightPeak × (wattsPerLiter − threshold)` capped at peak |
| `excess_nutrients` | NO3 ppm or PO4 ppm above plant optimum | `excessNutrientPeak × max(nitrateExcess, phosphateExcess)` capped |
| `nutrient_deficiency` | NO3 ppm or PO4 ppm below plant optimum | `nutrientDeficiencyPeak × max(nitrateDef, phosphateDef)` capped (small) |
| `low_plant_power` | `plantPower < weaknessThreshold` | `lowPlantPowerPeak × (weaknessThreshold − plantPower)` capped |

Notes:

- "Excess" and "deficiency" are *relative to plant optimum* (existing
  config in `nutrients.ts`), not absolute. Excess fires only when the
  tank has more than plants need. This is the cleanest expression of
  "plants and algae compete for the same pool."
- `excess_nutrients` should be the dominant nutrient lever (large peak).
  `nutrient_deficiency` is intentionally small — it's the canary
  signalling "plants are starving, algae moves in," but most of the
  decline-driven boost should flow through `low_plant_power`. Keep both
  channels visible in the breakdown so the player can read the two
  signals separately.
- `low_plant_power` and `plant_suppression` are mirror-image factors
  with a deadband between `weaknessThreshold` and `suppressionThreshold`
  — neither fires in the middle band, giving the system a quiet zone.
  Rough first values: `weaknessThreshold = 0.3`, `suppressionThreshold = 1.0`.
- `excess_light` threshold should sit roughly above where most plants
  saturate (call it ~0.5 W/L for first pass); below the threshold,
  light is "what plants are using" and algae gets nothing. Tune later.

Algae has no temperature / pH / oxygen channels in this pass. They
matter biologically but lower-order; defer until calibration shows
they're needed.

### Mass decay

When `condition < 100`, algae mass decays:

```
massDecay_per_tick = decayRate × (1 − condition / 100) × mass
state.algae.mass -= massDecay_per_tick   (clamp ≥ 0)
```

So a totally suppressed bloom (`condition = 0`) bleeds at full
`decayRate × mass`; a stable bloom at `condition = 50` bleeds at half
that. First-pass `decayRate` ~0.01 /h (1% of remaining mass per hour
when fully suppressed). Tune in calibration.

Decayed mass is **lost from the system** — not converted to waste,
nutrients, or anything else. Same convention as scrubbing today. The
nutrient cycle of dead algae is a future task if it matters; for now
the player's fix loop is "improve conditions, watch it shrink."

### Surplus → mass growth

Once `condition === 100` and the net rate is still positive, the
overflow becomes `algae.surplus`. A tick-spend step drains surplus into
mass:

```
drained = min(algae.surplus, algaeGrowthPerTickCap)
factor  = max(0, 1 − mass / 100)             // asymptotic at 100
massIncrease = drained × factor × massPerSurplus
algae.surplus -= drained
algae.mass    += massIncrease   (clamp ≤ 100)
```

Same shape as `plant-growth.ts`'s `spendSurplusOnGrowth`. Tunable
constants in `algae-vitality.ts` config.

Photoperiod gating: surplus banking only happens while lights are on,
matching plants. Mass decay happens 24/7.

### Tick ordering

Move algae out of PASSIVE tier into ACTIVE, sequenced after plants in
the active orchestrator (so algae stressors read freshly-updated plant
conditions in the same tick). The existing `algaeSystem` registration
in `systems/index.ts` is replaced by the new active-tier orchestrator
hook — no separate `System` entry in the registry, mirroring how plants
and fish are orchestrated rather than registered as systems.

### Algae-on-plant stressor

The plant-side `algae_shading` stressor already exists in
`plant-vitality.ts` (gated by `algaeShadingThreshold` and
`algaeShadingSeverity`). Two adjustments:

1. Update its data source from `state.resources.algae` to
   `state.algae.mass`. Pure rename plumbing.
2. Set `algaeShadingThreshold = 30` and pick a severity that ramps
   meaningfully past it, so above-30% algae is felt by plants. Exact
   number is calibration-grade — first-pass severity of ~0.05 %/h per
   point of algae above threshold (so 60% algae → ~1.5 %/h damage) is
   a reasonable starting place. Adjust during the bench scenario below.

This is the feedback loop that makes the 30% threshold meaningful: a
mild bloom self-limits via plant suppression, but a heavy bloom
hammers plants into decline, which in turn lifts algae's
`plant_suppression` stressor, which lets algae grow more — the death
spiral. Manual scrubbing is the player's only out once it spirals, by
design.

### UI

Algae card lives in the Plants panel where it appears today (top of
`Plants.tsx`, currently the "Algae 22 (Trace)" line). Promote it from a
line to a full card with the same shape as PlantCard:

- Mass bar (0–100), labelled "Coverage"
- Condition bar (0–100), labelled "Cond"
- Status pill matching condition: **Receding / Suppressed / Active /
  Spreading / Booming** (low-to-high). Color the pill: green low, amber
  mid, red high — inverted from plants/fish, because the player wants
  algae condition *low*. The condition bar itself can keep the same
  green-amber-red palette as plants (it represents algae's own
  vitality, not the player's preference).
- Trend arrow (↑/↓) for condition, same TREND_EPSILON convention as
  plants and fish.
- Collapsible `▶ Conditions (N)` block listing stressors (red,
  negative) and benefits (green, positive), same renderer as
  PlantCard's conditions block.
- No size/condition card chrome (X / scissors icons) — algae has no
  per-individual actions. Scrub remains a tank-level action button
  (kept where it is today).

Status thresholds for the pill:

```
condition < 10  → Receding
condition < 30  → Suppressed
condition < 60  → Active
condition < 80  → Spreading
condition >= 80 → Booming
```

When `mass === 0`, render the card collapsed: "Algae — clear" with no
bars. Vitality is computed but irrelevant; no need to surface the
breakdown when there's nothing there.

The standalone "Algae 22 (Trace)" badge above the plant list goes
away — replaced by the card.

### Scrub action and alerts

- `scrub-algae.ts` action moves to operate on `state.algae.mass`. Same
  enable threshold (mass ≥ 5), same percent-removal.
- `high-algae.ts` alert reads `state.algae.mass` instead of
  `state.resources.algae`. Same threshold.
- Calibration scripts and any test that reads/writes
  `state.resources.algae` migrate to `state.algae.mass`. Search for
  every reader; clean cut.

## In scope

- New `state.algae` shape; remove `Resources.algae`.
- New `src/simulation/systems/algae-vitality.ts` — stressor/benefit
  builders.
- New `src/simulation/config/algae-vitality.ts` — severity coefficients,
  thresholds, `hardiness`, `decayRate`, growth caps.
- New active-tier orchestrator `src/simulation/algae/index.ts` (mirrors
  `plants/index.ts` / `livestock/index.ts`): runs vitality, banks
  surplus, spends surplus on mass growth, applies mass decay.
- Delete the existing `algaeSystem` (PASSIVE-tier registration), the
  existing growth formula in `algae.ts`, and the related
  `calculateAlgaeGrowth` / `calculatePlantCompetitionFactor` /
  `calculateNutrientBoostFactor` exports. Fully cleaned, no shims.
- Plant-side: `algae_shading` reads new state shape; threshold to 30,
  severity tuned to make >30% bloom matter.
- UI: Algae card in `Plants.tsx`, status labels, conditions breakdown.
- Migrate scrub action, high-algae alert, calibration scripts, and
  every test that touches algae state.
- Update `docs/6-PLANTS.md` (or wherever algae is specced — find it,
  update it, or move it to a new top-level "organisms" section if it
  doesn't have a clean home).
- `CHANGELOG.md` entry.

## Out of scope

- Calibration. First-pass numbers are mechanism-correct, not
  ecologically accurate. A holistic recalibration will follow this
  task and Task 41.
- Nutrient consumption by algae. Algae currently doesn't take nitrate
  / phosphate from the pool, and this task doesn't change that. If
  algae *did* consume the same pool plants do, the
  `excess_nutrients` benefit would self-limit organically. Nice
  property, but adds calibration surface area; defer.
- Algae as a fish stressor (covers gills, etc.). Real concern, but
  decline path can wait.
- Multiple algae species (BBA / GSA / hair). Single aggregate is fine
  for now; the new state shape is extensible.
- Generic colony / mass-based-organism abstraction. This task makes
  algae the first instance; once a second instance lands (snails or
  shrimp colony), look for the shared shape and refactor then.
- Mass-decay → waste conversion. Decayed algae just disappears for
  now.

## Acceptance criteria

- `Resources.algae` is gone; no string `resources.algae` remains in
  the codebase. `grep -r 'resources\.algae' src/` returns zero hits.
- New `state.algae` exists with `mass`, `condition`, `surplus`, all
  initialised correctly on `createSimulation`.
- Algae vitality runs through `computeVitality`. The breakdown
  surfaces every stressor/benefit listed above with the right keys
  and signs.
- Heavy plants in a healthy tank push algae condition below 100 and
  mass shrinks visibly within a few sim days (mechanism — exact rate
  calibration-grade).
- Pure-light tank with no plants and no dosing accumulates algae mass
  via excess-light benefit alone, capped by the 100 ceiling and the
  asymptotic factor.
- Mass decay only fires when `condition < 100`. With condition pinned
  at 100, mass is monotonically non-decreasing (modulo scrub).
- Algae card renders in the Plants panel with mass / condition bars,
  status pill, trend arrow, and collapsible conditions list.
- Scrub action and high-algae alert work on the new state field.
- All existing tests and calibration scripts pass after migration.
- `docs/6-PLANTS.md` (or wherever algae is specced) reflects the new
  organism model.

## Tests

Standard project test discipline applies (see `CLAUDE.md` task
workflow): unit tests for the new vitality builder covering each
stressor / benefit firing condition, the mass-decay formula at
representative condition values, the surplus-spend formula, and the
state-shape migration. Integration test: a 7-day "neglected high-light
unplanted" run grows algae from 0 toward saturation; a 7-day
"thriving heavily-planted" run from algae mass 50 sees mass shrink as
condition bleeds. Aim for 90% coverage matching project standard.

## Notes

This is the first time a "living thing" is represented as a single
population state rather than per-individual specimens. That's
deliberately preserved in the shape — `state.algae` is one organism,
not an array of them. The shape extends naturally to colonies of
shrimps / snails when those land: each colony has its own
`{ mass, condition, surplus }`, plus colony-specific fields (food,
species). Resist the urge to pre-build a generic `Colony` abstraction
in this task — get one instance right first, then refactor when the
second instance shows up.

Watch the open design tension flagged in the project card: the
current vitality model lost intermediate steady-state condition values
(scenarios snap to 100 or to dying). Adding algae as a vitality
participant *increases* the surface area for binary thriving-or-dying
behavior; the death-spiral mechanic above is intentional, but the
intermediate "tank holds at modest algae forever" steady state may be
hard to find with these mechanics alone. That's a calibration concern,
not a blocker, and it's not in scope here. Note any oddities you
observe during integration testing in PR notes for the recalibration
session that follows.

## References

- Vitality engine: `src/simulation/systems/vitality.ts`
- Plant vitality builder: `src/simulation/systems/plant-vitality.ts`
- Fish vitality builder: `src/simulation/systems/fish-health.ts`
  (note the `plantPower` formula in the plant-benefit section —
  reuse it directly for algae)
- Plant orchestration: `src/simulation/plants/index.ts` (template
  for `algae/index.ts`)
- Plant growth (surplus spend): `src/simulation/systems/plant-growth.ts`
- Current algae system: `src/simulation/systems/algae.ts` (deleted)
- Current algae config: `src/simulation/config/algae.ts` (replaced
  by `algae-vitality.ts`)
- State: `src/simulation/state.ts` (Resources, SimulationState,
  createSimulation, AlertState)
- Scrub action: `src/simulation/actions/scrub-algae.ts`
- High-algae alert: `src/simulation/alerts/high-algae.ts`
- Plant nutrient optimums: `src/simulation/config/nutrients.ts`
  (`optimalNitratePpm`, `optimalPhosphatePpm`)
- UI plant panel: `src/ui/components/panels/Plants.tsx`
- Related tasks: 40 (vitality model — established the engine), 41
  (hunger-satiation-bands — sibling tuning of the same engine)

## Post-implementation revision

After playing with the live UI on 2026-05-02, the `condition`
intermediate was dropped: algae was refactored from
`{ mass, condition, surplus }` to `{ mass, surplus }` and treated as
a pure population. Net rate (benefits − stressors, post-hardiness)
now drives mass directly — positive net banks as surplus
(photoperiod-gated), negative net shrinks mass directly (24/7).
`computeAlgaeVitality` became `computeAlgaePopulation`,
`applyMassDecay` was deleted (replaced by the direct `mass + net`
step), and the AlgaeCard dropped its Cond bar — the coverage bar
now graduates green → yellow → red as mass climbs, matching the
status pill. This also previews the colony shape (shrimps, snails):
populations don't need condition either.

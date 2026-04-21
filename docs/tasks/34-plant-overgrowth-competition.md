# Task 34: Plant overgrowth and interspecies competition

**Status:** pending

## Overview

The engine currently grows each plant independently against the global
pool of nutrients and light. Liebig's Law is applied per plant, but
plants don't compete with each other: a dense carpet of Monte Carlo and
a single Java Fern see the same downwelling light and draw from the
same nutrient pool without any interaction.

In real planted tanks, dense growth creates emergent competition:

- **Self-shading**: tall/dominant plants cast shadows on carpet species;
  light-starved foreground plants stall or die back.
- **Nutrient competition**: fast growers (Monte Carlo, hairgrass)
  out-compete slow growers (Java Fern) for the limiting macronutrient
  when the dose is tight, so undosed tanks see slow-species dieback
  before fast-species dieback.
- **Aeration effect**: dense biomass changes flow patterns (trivial
  for this engine but mentioned for completeness).

Scenario 02 Variant B touches this — Amazon Sword hovers at 55–75 %
while Monte Carlo stalls at 30–55 % — but only because their absolute
nutrient demands differ, not because of competition. A tank with only
Java Fern and only Monte Carlo would yield the same relative ranking
at steady state; real tanks show position-dependent outcomes (bottom-
level carpet suffers first; mid-column stays stable longest).

## References

- Specs: `docs/6-PLANTS.md`
- Engine: `src/simulation/plants/index.ts`,
  `src/simulation/systems/photosynthesis.ts`,
  `src/simulation/systems/nutrients.ts`
- Related calibration: `docs/calibration/scenarios/02-planted-equilibrium.md`
- Related follow-ups: Task 38 (auto-trimming / biomass cap)

## Scope

### In scope

- Biomass-driven light attenuation (per-plant effective light depends
  on total biomass above it in the canopy).
- Nutrient competition — when total demand exceeds supply, plants
  split the available pool by demand weight (or by some competitive
  factor if biologically motivated).
- Per-species growth penalty from competitive pressure.

### Out of scope

- Spatial placement (bottom/mid/top layers) — the engine has no
  positional model. Use biomass and demand-tier as proxies.
- Nutrient micro-zones around substrate — unless the substrate leaching
  task (37) lands first and introduces a zoned resource model.

## Design options

**Option A — Beer–Lambert light attenuation**

Effective PAR for plant i = incident × exp(−k × biomass_above_i).
Requires a canopy-height concept, even if coarse (e.g. "low/mid/high"
mapped from species). Physically grounded, tunable via one k constant.

**Option B — Aggregate-demand Liebig**

Each nutrient pool is shared across plants by weighted draw:
plant_i_share = demand_i / total_demand. Plants with higher demand
steal disproportionately. Simpler than A but loses the spatial signal.

**Option C — Both**

Light attenuation + aggregate-demand Liebig in combination. The
scenario story (Monte Carlo dying under Amazon Sword) has both
signals; splitting them lets us calibrate independently.

Tradeoffs: Option A is elegant but requires canopy-height metadata per
species (small addition to `PLANT_SPECIES_DATA`). Option B is cheap but
doesn't capture self-shading. Option C doubles the surface area to
calibrate — more knobs, more chances to get it wrong, but matches what
hobbyists actually observe.

## Acceptance criteria

- Dense biomass of a dominant species measurably stalls a subordinate
  species in the same tank.
- An undosed Variant B scenario with 5× the default plant biomass shows
  stronger high-demand dieback than the baseline biomass case.
- No regression in current scenarios' primary anchors — the model
  must collapse cleanly to the single-plant case.

## Notes

Not blocking the calibration-foundation PR. Current engine works
because scenarios 01–04 stage biomass levels at or below the point
where competition emerges. The gap surfaces only in custom setups
with heavy planting — which is exactly the usage Vlad wants to
support long-term.

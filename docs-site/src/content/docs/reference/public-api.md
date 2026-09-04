---
title: "Public API"
description: "What the npm package exposes: creating a tank, advancing it, acting on it, reading it, and the types that come with all of it."
---

`aquarium-simulator` publishes one module. Everything below is imported from the
package root — there are no subpath entry points, and nothing reaches past the
barrel.

| Property | Value |
|---|---|
| Package | `aquarium-simulator`, MIT |
| Format | ESM only, types included |
| Published | `dist/` — the engine. The web UI is not part of the package |
| Runtime dependency | `immer`, and nothing else |
| Mutation | None. Every entry point returns a new state |

## The shape of a session

Build a tank, advance it an hour at a time, act on it between hours, and read
whatever you need off the state you were handed. The host owns the clock, the
storage and the rendering.

```ts
import { createSimulation, tick, applyAction } from 'aquarium-simulator';

let state = createSimulation({ tankCapacity: 60 });

state = applyAction(state, { type: 'feed', amount: 0.5 }).state;

for (let hour = 0; hour < 24; hour++) {
  state = tick(state);
}
```

## Capabilities

| Capability | Key exports | What it gives you |
|---|---|---|
| Create a tank | `createSimulation`, `SimulationConfig`, `DEFAULT_HEATER`, `DEFAULT_LID`, `DEFAULT_ATO`, `DEFAULT_LIGHT` | A tank from a capacity and whatever devices you name. Everything else falls back to a default, and a non-finite or impossible input throws rather than settling |
| Start from a preset | `PRESETS`, `DEFAULT_PRESET_ID`, `getPresetById`, `createPresetSimulation`, `presetName`, `PresetId`, `PresetDefinition` | The five shipped tanks, and the one call that reads both halves of a preset together |
| Seed a starting state | `PresetSeed`, `SeedBacteria`, `SeedColony`, `SeedResources`, `SeedFishGroup`, `SeedPlantGroup`, `cycledColony`, `cycledNitrate`, `cycledReserve` | Open a tank part-way through its life — a colony, a bed, a roster, a scape. The three `cycled*` helpers answer what a month-old tank of a given size carries |
| Advance time | `tick`, `getHourOfDay`, `getDayNumber` | One tick is one hour. `tick` is pure: same state and config in, same state out |
| Act on the tank | `applyAction`, `Action` and the per-verb action types, `ActionResult` | The eleven husbandry verbs — feed, water change, top-off, dose, trim, scrub, add and remove plants and fish, sell fry — dispatched through one call |
| Ask before acting | `canDose`, `canAddPlant`, `canAddFish`, `canScrubAlgae`, `canTrimPlants`, `checkFishCapacity`, `getDosePreview`, `getPlantsToTrimCount`, `getMaxPlants`, `getMaxFishMass` | Whether the tank is in a state to be dosed, stocked, scrubbed or trimmed, asked before the verb runs, so a UI can grey a control rather than let it fail. The other refusals — an out-of-range water change, a top-off on a full tank, a feed amount that is not a positive number, an id that names nothing, selling with no fry — carry no preflight, and the action's own message is where a host learns of them |
| Use the engine's own option sets | `WATER_CHANGE_AMOUNTS`, `MIN_SCRUB_PERCENT`, `MAX_SCRUB_PERCENT`, `MIN_ALGAE_TO_SCRUB`, `MAX_DOSE_ML` | The values an action legitimately takes, so a caller offers choices the engine will accept |
| Read the state | `SimulationState`, `Tank`, `Resources`, `Environment`, `Equipment`, `Plant`, `Fish`, `Clutch`, `AlgaeState`, `AlertState` | The whole tank as plain data. Nitrogen compounds and nutrients are stored as mass in mg; dissolved gases as mg/L |
| Read it in display terms | `ResourceRegistry`, `AllResources`, `ResourceDefinition`, `ResourceKey`, `getMassFromPpm` | Per-resource metadata — bounds, unit, display precision — so a host formats a reading the way the engine means it |
| Understand a number | `computeVitality`, `computeFishVitality`, `computePlantVitality`, `computeAlgaePopulation`, `buildPlantStressors`, `buildPlantBenefits`, `buildAlgaeStressors`, `buildAlgaeBenefits`, `VitalityBreakdown` | The per-factor breakdown behind a condition score: which stressors are charging, which benefits are paying, and by how much |
| Adjust the model | `TunableConfig`, `DEFAULT_CONFIG` | The whole constant surface as one object. Pass a modified copy to `tick` and it takes effect that hour |
| Inspect the catalogs | `FISH_SPECIES_DATA`, `PLANT_SPECIES_DATA`, `getSaturationIrradiance`, `FishSpecies`, `FishSpeciesData`, `PlantSpecies`, `PlantSpeciesData`, `FishBreedingData` | What each species is: tolerance bands, hardiness, growth, lifespan, breeding |
| Build and read equipment | `FILTER_SPECS`, `FILTER_SURFACE`, `SUBSTRATE_SURFACE_PER_LITER`, `SUBSTRATE_ORGANIC_PER_LITER`, `HARDSCAPE_SURFACE`, `POWERHEAD_FLOW_RATES`, `HEATER_WATTAGE_OPTIONS`, `LIGHT_PAR_OPTIONS`, `LID_MULTIPLIERS`, `getFilterFlow`, `getSubstrateSurface`, `calculateParAtDepth`, `rescape` | Every device catalog, and the functions that turn a device into the surface, flow and light the tank actually gets |
| Size a tank | `calculateTankHeight`, `calculateTankGlassSurface`, `calculateHardscapeSlots` | The geometry a capacity implies — depth for the light calculation, glass area for the colony, slots for the scape |
| Run schedules | `DailySchedule`, `isScheduleActive`, `isValidSchedule`, `formatSchedule` | The start-hour-plus-duration shape every scheduled device uses, and the check for whether it is on |
| Watch for trouble | `checkAlerts`, `alerts`, `Alert`, `AlertResult`, `WATER_LEVEL_CRITICAL_THRESHOLD`, `HIGH_ALGAE_THRESHOLD` | The threshold-crossing alerts a tick raises, and the definitions behind them |
| Read the log | `LogEntry`, `LogSeverity`, `LogEvent`, `createLog` | The event stream a tick appends to, and the constructor for a host's own entries |
| Reproduce a run | `RngState` | The seed and stream position every draw comes off. Serialize it and the tank replays exactly |
| Reach into a tick | `System`, `coreSystems`, `Effect`, `EffectTier`, `applyEffects`, and the per-system calculators | The tick's own machinery, for a host that wants to measure one step rather than run the whole hour |

## Types you inherit

Every state shape, every configuration shape, every enum a host would otherwise
restate — species ids, filter and substrate and lid and hardscape types, action
types, life stages, breeding modes — is exported as a type. A consumer's own
model can be written against them rather than beside them.

## What is not in it

| Absent | Why it matters |
|---|---|
| The web UI | It consumes this package like any other host; nothing in `dist/` knows it exists |
| CommonJS | The `exports` map offers `import` only |
| Persistence | The engine has no storage opinion. State is plain serializable data — the host decides where it goes |
| A mass-to-ppm helper | `getMassFromPpm` turns a test-kit reading into stored mass. The inverse is not on the barrel, so a host displaying a concentration divides by `resources.water` itself |
| A clock | Nothing schedules a tick. Autoplay, stepping and speed belong to the host |

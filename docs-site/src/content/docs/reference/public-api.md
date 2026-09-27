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
| Create a tank | `createSimulation`, `SimulationConfig`, `relight`, `DEFAULT_HEATER`, `DEFAULT_LID`, `DEFAULT_ATO`, `DEFAULT_LIGHT` | A tank from a capacity and whatever devices you name. Everything else falls back to a default, and a non-finite or impossible input throws rather than settling. The config's `optics` are the ones you will tick with — its first day of light is read through them, the shipped optics when it names none. `relight` reads a tank still at hour zero through optics it was not built on |
| Start from a preset | `PRESETS`, `DEFAULT_PRESET_ID`, `getPresetById`, `createPresetSimulation`, `presetName`, `PresetId`, `PresetDefinition` | The five shipped tanks, and the one call that reads both halves of a preset together |
| Seed a starting state | `PresetSeed`, `TankSeed`, `SeedBacteria`, `SeedColony`, `SeedResources`, `SeedFishGroup`, `SeedPlantGroup`, `cycledBedNutrients`, `cycledColony`, `cycledHardness`, `cycledKhReserve`, `cycledReserve`, `cycledWaterNutrients`, `startingHardness` | Open a tank part-way through its life — a colony, a bed, a roster. The `cycled*` helpers answer what a month-old tank of a given build carries |
| Advance time | `tick`, `getHourOfDay`, `getDayNumber` | One tick is one hour. `tick` is pure: same state and config in, same state out |
| Act on the tank | `applyAction`, `Action` and the per-verb action types, `ActionResult` | The twelve husbandry verbs — feed, water change, top-off, dose, root tab, trim, scrub, add and remove plants and fish, sell fry — dispatched through one call |
| Ask before acting | `canDose`, `canRootTab`, `canAddPlant`, `canAddFish`, `canScrubAlgae`, `canTrimPlants`, `checkPlantFootprint`, `checkFishCapacity`, `getDosePreview`, `getPlantsToTrimCount`, `getMaxFishMass` | Whether the tank is in a state to be dosed, tabbed, stocked, scrubbed or trimmed, asked before the verb runs, so a UI can grey a control rather than let it fail. `canAddPlant(state, species)` asks whether that species' footprint fits the floor left; `canTrimPlants(state, { targetSize, plantId?, familyId? })` asks about the trim it names — a plantable target, and a plant in its scope over it; `checkPlantFootprint` answers with the floor free, the floor the species needs and the refusal `addPlant` would give. `getDosePreview` meters by a `FertilizerFormula` the caller hands it — the config's `nutrients.fertilizerFormula`, the same one `dose` mixes to, so a preview reads the bottle the tank is actually dosed from. The other refusals — an out-of-range water change, a top-off on a full tank, a feed amount that is not a positive number, an id that names nothing, selling with no fry — carry no preflight, and the action's own message is where a host learns of them |
| Use the engine's own option sets | `WATER_CHANGE_AMOUNTS`, `MIN_SCRUB_PERCENT`, `MAX_SCRUB_PERCENT`, `MIN_ALGAE_TO_SCRUB`, `MAX_DOSE_ML`, `MAX_ROOT_TABS`, `MIN_PLANTABLE_SIZE`, `isPlantableSize` | The values an action legitimately takes, so a caller offers choices the engine will accept |
| Read the state | `SimulationState`, `Tank`, `Resources`, `Environment`, `Equipment`, `Plant`, `Fish`, `Clutch`, `AlgaeState`, `Blooms`, `AlertState` | The whole tank as plain data. Nitrogen compounds and nutrients are stored as mass in mg, KH and GH as mg of CaCO₃; dissolved gases as mg/L |
| Read it in display terms | `ResourceRegistry`, `AllResources`, `ResourceDefinition`, `ResourceKey`, `getMassFromPpm`, `getDkh`, `getKhMass`, `getDgh`, `getGhMass` | Per-resource metadata — bounds, unit, display precision — so a host formats a reading the way the engine means it |
| Read pH | `getPh`, `carbonatePh` | pH is not stored: it is derived from CO₂ and KH, and these read it off a tank or off any pair of values |
| Understand a number | `computeVitality`, `computeFishVitality`, `computePlantVitality`, `computeAlgaeVitality`, `buildPlantStressors`, `buildPlantBenefits`, `buildAlgaeStressors`, `buildAlgaeBenefits`, `plantNitrateEdge`, `VitalityBreakdown`, `AlgaeVitalityContext` | The per-factor breakdown behind a condition score: which stressors are charging, which benefits are paying, and by how much. A plant's vitality runs on its `PlantLight`, the bloom's on its `BloomLight`; `plantNitrateEdge` is the nitrate a species takes harm past |
| Read a planting | `readPlantLight`, `PlantLight`, `canopyLight`, `CanopyLight`, `plantHeight`, `leafArea`, `rateUnits`, `LEAF_AREA_PER_RATE_UNIT`, `floorCover`, `floorShade`, `isOvergrown` | What each plant stands in — its height, its leaf in cm² and rate units, PAR at its mean leaf and crown top, and the day's light there against what it starves under — and the planting's floor cover and floor shade. `readPlantLight` builds the canopy once for the whole planting |
| Follow a plant's bank | `spendSurplus`, `propagate`, `Propagation`, `getSpeciesGrowthRate`, `VIGOUR_SPAN` | What the bank buys in an hour — the offshoot a full one pays for, and the size growth draws — and the span a plant's vigour is drawn within |
| Follow a plant's nutrients | `calculateNutrientSufficiency`, `nutrientShare`, `formHalfSaturations`, `formShares`, `formsMeet`, `bedPool`, `tankPools`, `plantFeeder`, `poolDraws`, `feederShares`, `organicNutrients`, `nutrientsIn`, `tissueMass`, `losePlant`, `Feeder`, `NutrientPool`, `TankPools`, `PoolDraw`, `NutrientForm`, `FormVector` | The water and the bed a feeder draws on, how much of its need each form meets — nitrogen as ammonia, then nitrate — and where it feeds — a plant by its growth form's roots — the grams of organic matter a size of plant is, the recipe it carries, and what low condition sheds of it and death leaves |
| Follow the blooms | `ALGAE`, `ALGAE_KINDS`, `AlgaeKind`, `AlgaeHabitat`, `AlgaeTraits`, `EMPTY_BLOOM`, `emptyBlooms`, `isAlgaeKind`, `kindsIn`, `mapKinds`, `combinedCoverage`, `habitatSize`, `habitatGain`, `HabitatTank`, `resettle`, `bloomLight`, `columnGain`, `BloomLight`, `bloomTissue`, `bloomRateUnits`, `bloomFeeder`, `bloomFixer`, `purchaseBloom`, `massBought`, `supplyBloom`, `loseBloom`, `landSpores`, `BloomPurchase`, `thrivingPlantDensity` | What each kind of bloom is and where it lives — its habitat's size and the light over it — what its mass weighs and respires at, what its bank buys in an hour and what the water supplies, what it sheds or loses dying back, how its spores join it, and the thriving leaf per litre that harms it; the kinds' combined coverage, and what a change of habitat does to a bloom's coverage |
| Build an organism's factors | `hardened`, `fishHealingRate`, `floraHealingRate`, `VitalityFactor`, `VitalityInput` | Scale a stressor list by `1 − hardiness` before it reaches `computeVitality`, which charges every factor as given; the healing rates — a fish's, and the one plants and the bloom share — give the `healingRate` it needs |
| Adjust the model | `TunableConfig`, `FertilizerFormula`, `NutrientVector`, `DEFAULT_CONFIG` | The whole constant surface as one object. Pass a modified copy to `tick` and it takes effect that hour. A `NutrientVector` is one figure each of NO₃, PO₄, K and Fe — a formula, a root tab, the bed's store |
| Inspect the catalogs | `FISH_SPECIES_DATA`, `PLANT_SPECIES_DATA`, `GROWTH_FORMS`, `growthFormOf`, `FishSpecies`, `FishSpeciesData`, `PlantSpecies`, `PlantSpeciesData`, `GrowthForm`, `GrowthFormData`, `FishBreedingData` | What each species is: tolerance bands, hardiness, growth, lifespan, breeding, and what one full unit of a plant's growth form is |
| Read the flora law | `FloraTraits`, `plantTraits`, `saturationIrradiance`, `dailyLightEdge`, `tissuePerRateUnit`, `shedShare`, `FloraLoss` | The traits a plant species and a bloom are both written in — `plantTraits` reads a species into them — the PAR each saturates at and the daily light each starves under, the rate units a gram of tissue is, and the share low condition sheds and what `losePlant` and `loseBloom` leave |
| Build and read equipment | `FILTER_SPECS`, `FILTER_SURFACE`, `SUBSTRATE_SURFACE_PER_LITER`, `SUBSTRATE_ORGANIC_PER_LITER`, `SUBSTRATE_KH_RESERVE_PER_LITER`, `SUBSTRATE_NUTRIENTS_PER_LITER`, `HARDSCAPE_SURFACE`, `HARDSCAPE_TANNINS`, `createHardscapeItem`, `POWERHEAD_FLOW_RATES`, `HEATER_WATTAGE_OPTIONS`, `LIGHT_PAR_OPTIONS`, `LID_MULTIPLIERS`, `getFilterFlow`, `getSubstrateSurface`, `getSubstrateNutrients`, `calculateBedLeak`, `calculateParAtDepth`, `scheduledLightByHour`, `scheduledLightHistory`, `dailyLightIntegral`, `rescape`, `placeHardscape`, `liftHardscape`, `resetHardscape`, `disturbBed` | Every device catalog, and the functions that turn a device into the surface, flow and light the tank actually gets — hour by hour, and over the day the plants starve on — and what a fresh bed of a type holds for roots, and what a bed leaks into the water an hour |
| Size a tank | `calculateTankHeight`, `calculateFloorArea`, `calculateTankGlassSurface`, `calculateHardscapeSlots` | The geometry a capacity implies — depth for the light calculation, floor for the planting, glass area for the colony, slots for the scape |
| Run schedules | `DailySchedule`, `isScheduleActive`, `isValidSchedule`, `formatSchedule` | The start-hour-plus-duration shape every scheduled device uses, and the check for whether it is on |
| Watch for trouble | `checkAlerts`, `alerts`, `Alert`, `AlertResult`, `waterLevelAlertLine`, `algaeAlertLine`, `FREE_AMMONIA_EDGE`, `NITRITE_EDGE`, `NITRATE_EDGE`, `OXYGEN_EDGE`, `OXYGEN_COMFORT`, `toleranceFactor` | The threshold-crossing alerts a tick raises; the lines the water level and the bloom alert at, and the edges the free-ammonia, nitrite, nitrate and oxygen alerts fire at; how far hardiness carries each fish's own edge past them (`toleranceFactor`); and where the O₂ benefit is full (`OXYGEN_COMFORT`) |
| Read the log | `LogEntry`, `LogSeverity`, `LogEvent`, `LogQuantity`, `LogText`, `QuantityFormat`, `createLog`, `measured`, `liters`, `celsius`, `coverage`, `logText`, `metricQuantity` | The event stream a tick appends to, and the constructor for a host's own entries. A line's volumes, temperatures and a die-back's coverage stay quantities — built with `` measured`…${liters(x)}…` `` — and `logText(entry, format)` reads it in the host's units, metric by default |
| Reproduce a run | `RngState` | The seed and stream position every draw comes off. Serialize it and the tank replays exactly |
| Reach into a tick | `System`, `coreSystems`, `Effect`, `EffectTier`, `applyEffects`, `processFlora`, `FloraProcessingResult`, `BloomHour`, `calculatePhotosynthesis`, `plantFixer`, `CarbonFixer`, and the per-system calculators | The tick's own machinery, for a host that wants to measure one step rather than run the whole hour. `processFlora` is plants and every bloom in one pass, returning each one's vitality and light, what each bloom's bank spent, and what each one's new tissue took up from the water, the blooms keyed by kind; `calculatePhotosynthesis` takes every carbon fixer on one CO₂ stock |

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

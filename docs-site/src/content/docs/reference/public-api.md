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
| Create a tank | `createSimulation`, `SimulationConfig`, `settlePassiveResources`, `DEFAULT_HEATER`, `DEFAULT_LID`, `DEFAULT_ATO`, `DEFAULT_LIGHT` | A tank from a capacity and whatever devices you name. Everything else falls back to a default, and a non-finite or impossible input throws rather than settling. Its `optics` and `plants` should be the ones you tick with: the first day's light is read through them and seeded plants stocked on them, the shipped ones by default. `settlePassiveResources` settles the passive readings after writing equipment or optics |
| Start from a preset | `PRESETS`, `DEFAULT_PRESET_ID`, `getPresetById`, `createPresetSimulation`, `presetName`, `PresetId`, `PresetDefinition` | The five shipped tanks; `createPresetSimulation(preset, tunables, rngSeed)` builds one on the tunables you will tick with |
| Seed a starting state | `PresetSeed`, `TankSeed`, `SeedBacteria`, `SeedColony`, `SeedResources`, `SeedFishGroup`, `SeedPlantGroup`, `cycledBedNutrients`, `cycledColony`, `cycledHardness`, `cycledKhReserve`, `cycledReserve`, `cycledWaterNutrients`, `startingHardness` | Open a tank part-way through its life — a colony, a bed, a roster. The `cycled*` helpers answer what a month-old tank of a given build carries |
| Advance time | `tick`, `getHourOfDay`, `getDayNumber` | One tick is one hour. `tick` is pure: same state and config in, same state out |
| Act on the tank | `applyAction`, `Action` and the per-verb action types, `ActionResult` | The twelve husbandry verbs — feed, water change, top-off, dose, root tab, trim, scrub, add and remove plants and fish, sell fry — dispatched through one call; alone, `scrubAlgae(state, plantsConfig)` and `addPlant(state, action, plantsConfig)` take the plants config |
| Ask before acting | `canDose`, `canRootTab`, `canAddPlant`, `canAddFish`, `canTrimPlants`, `onTheGlass`, `checkPlantFootprint`, `checkFishCapacity`, `stockedMass`, `getDosePreview`, `getPlantsToTrimCount`, `getMaxFishMass` | Whether the tank can be dosed, tabbed, stocked or trimmed — and what a scrub would take off the glass — asked before the verb runs, so a control greys rather than fails. `canAddPlant(state, species)` asks whether its footprint fits the floor left, `canTrimPlants(state, { targetSize, plantId?, familyId? })` whether the trim names a plantable target and a plant over it; `checkPlantFootprint` answers with the floor free, the floor needed and `addPlant`'s refusal. `getDosePreview` meters by the `FertilizerFormula` handed it — pass the config's, the one `dose` mixes to. The other refusals — a water change out of range, a top-off on a full tank, a non-positive feed, an id that names nothing, selling with no fry — carry no preflight; the action's message reports them |
| Use the engine's own option sets | `WATER_CHANGE_AMOUNTS`, `MAX_DOSE_ML`, `MAX_ROOT_TABS`, `MIN_PLANTABLE_SIZE`, `isPlantableSize`, `STOCKED_FISH_SIZE`, `MAX_STOCKED_SIZE`, `isStockableSize` | The values an action legitimately takes, so a caller offers choices the engine will accept |
| Read the state | `SimulationState`, `Tank`, `Resources`, `Environment`, `Equipment`, `Plant`, `Fish`, `Clutch`, `AlgaeState`, `Blooms`, `AlertState`, `quietAlerts` | The whole tank as plain data. Nitrogen compounds and nutrients are stored as mass in mg, KH and GH as mg of CaCO₃; dissolved gases as mg/L. A plant's and a bloom's `budget` is a `FloraState`, a fish's a `DebState`, and a fish's `load` a `ToxinVector` in ppm; waste and mulm are `Organics` |
| Read it in display terms | `ResourceRegistry`, `AllResources`, `ResourceDefinition`, `ResourceKey`, `getMassFromPpm`, `getDkh`, `getKhMass`, `getDgh`, `getGhMass` | Per-resource metadata — bounds, unit, display precision — so a host formats a reading the way the engine means it |
| Read pH | `getPh`, `carbonatePh` | pH is not stored: it is derived from CO₂ and KH, and these read it off a tank or off any pair of values |
| Understand a number | `computeVitality`, `computeFishVitality`, `computePlantVitality`, `computeAlgaeVitality`, `buildPlantStressors`, `buildPlantBenefits`, `buildAlgaeStressors`, `buildAlgaeBenefits`, `plantNitrateEdge`, `VitalityResult`, `VitalityBreakdown`, `AlgaeVitalityContext` | The per-factor breakdown behind a condition score — which stressors charge, which benefits pay, how much, and what the reserve repaired — off the hour the organism's budget ran, a fish's `FishHour` or a flora's `FloraFluxes`; `plantNitrateEdge` is the nitrate a species takes harm past |
| Read a planting | `readPlantLight`, `PlantLight`, `canopyLight`, `CanopyLight`, `LightPath`, `sizeOf`, `unitOf`, `Planted`, `Unit`, `plantHeight`, `leafArea`, `rateUnits`, `LEAF_AREA_PER_RATE_UNIT`, `floorCover`, `floorShade`, `floorLight`, `plantLightTaken`, `isOvergrown` | What each plant stands in — its size, height and leaf in cm² and rate units, read off a `Unit` (`unitOf`), PAR at its mean leaf and crown top, the day there against its rated day, and what took the lamp's light on the way — and the planting's floor cover, shade and light, and the share of its light each bloom takes. `readPlantLight` builds the canopy once for the whole planting |
| Follow a flora's budget | `plantParams`, `unitParams`, `bloomParams`, `FloraState`, `FloraParams`, `FloraFluxes`, `storeFill`, `storeGap`, `droopLimits`, `droopFactor`, `fullDroopFactor`, `fillAtDroop`, `floraOrganics`, `stocked`, `scaleFlora`, `offshootReady`, `offshootShare`, `offshootStructure`, `VIGOUR_SPAN` | Each kind's parameters, and a unit's at its vigour; each store's fill, gap and Droop limit, the ruling one, its ceiling on full stores, and the fill an edge sits at; the organics a flora holds; a flora stocked, or a share of one; a plant's offshoot — ready, how far built, its size — and the span its vigour is drawn within |
| Read any budget's reserve | `reserveDensity`, `wellFed`, `starvation`, `oxygenPace`, `NO_STRESS`, `DebStress` | How full an organism's reserve stands and how well fed that leaves it, the share of its upkeep an hour left unpaid, and the oxygen pace and stress multipliers every budget takes |
| Follow a fish's budget | `fishMass`, `fishSize`, `fishOrganics`, `frySize`, `eggMass`, `fishLifeStage`, `countFry`, `mature`, `debParams`, `incubation`, `DebState`, `DebParams`, `readyToBrood`, `paysTowardBrood`, `FishHour` | What a fish's budget reads as — its weight, its size against grown length, the organics it holds, its maturity and life stage — its species' parameters and incubation, and whether it spawns or pays toward a brood this hour |
| Follow a clutch | `clutchMass`, `clutchesWithMothers` | What a clutch's eggs weigh, and which clutches still have a mother to carry them |
| Follow a hunted fish | `predationStress`, `predatorWeight`, `preyVulnerability` | The damage its predators do a young fish an hour before hardiness, each predator's weight on it, and how its exposure falls as it grows |
| Follow a fish's load | `waterToxins`, `TOXINS`, `Toxin`, `ToxinVector` | What the water holds of each toxin a fish loads — the free share of its ammonia, its nitrite, its nitrate, in ppm — the levels every fish's `load` moves toward. A `ToxinVector` is one figure each of them — a load, the loading rates |
| Follow a feeder's nutrients | `speciesDemand`, `formHalfSaturations`, `formShares`, `bedPool`, `tankPools`, `plantFeeder`, `poolDraws`, `nutrientsIn`, `tissueMass`, `Feeder`, `NutrientPool`, `TankPools`, `PoolDraw`, `NutrientForm`, `FormVector` | The water and the bed a feeder draws on, how much of its stores' ask each form meets — nitrogen as ammonia, then nitrate — where it feeds, a plant by its form's roots, and the grams a size of plant weighs |
| Follow the blooms | `ALGAE`, `ALGAE_KINDS`, `AlgaeKind`, `AlgaeHabitat`, `AlgaeTraits`, `EMPTY_BLOOM`, `emptyBlooms`, `isAlgaeKind`, `mapKinds`, `habitatSize`, `habitatGain`, `placeShare`, `HabitatPlace`, `HabitatTank`, `REMOVED_BY`, `BloomRemoval`, `bloomLight`, `columnGain`, `BloomLight`, `lightLoss`, `waterExtinction`, `columnPass`, `bloomPass`, `LightLoss`, `BloomLightLoss`, `BloomTank`, `bloomCoverage`, `coverageOf`, `bloomTissue`, `bloomRateUnits`, `bloomFeeder`, `bloomFixer`, `sporesBuilt`, `landSpores`, `coverageAt`, `clearPlace`, `thrivingPlantDensity`, `allelopathy` | Each kind and where it lives — its habitat's size and the light over it — its coverage off its tissue and back, what it fixes and feeds at, its spores, and the exudates of thriving leaf per litre that lower its assimilation; the light each kind takes off a `BloomTank` — green water in the water's extinction, film as a coat on every leaf — its coverage at a place, a place laid bare, and the verb that takes each habitat's bloom out |
| Build an organism's factors | `hardened`, `VitalityFactor`, `VitalityInput` | Scale a stressor list by `1 − hardiness` before it reaches `computeVitality`, which charges every factor as given and adds the points the reserve `healed` |
| Follow a fish's feeding | `appetite`, `gutCapacity`, `fullPaceLine`, `ration`, `burn`, `gillAmmonia`, `Pace`, `tankPaces` | A fish's appetite and what its gut holds at a pace — τ, ω and its load's stress — the fullness under which its gut digests less than its budget can take up, the food whose assimilation pays the upkeep it owes, what burning its organics does to the water and the gill ammonia alone, and the pace every fish in a tank runs at |
| Adjust the model | `TunableConfig`, `FertilizerFormula`, `NutrientVector`, `DEFAULT_CONFIG` | The whole constant surface as one object. Pass a modified copy to `tick` and it takes effect that hour. A `NutrientVector` is one figure each of NO₃, PO₄, K and Fe — a formula, a root tab, the bed's store |
| Inspect the catalogs | `FISH_SPECIES_DATA`, `PLANT_SPECIES_DATA`, `GROWTH_FORMS`, `growthFormOf`, `FishSpecies`, `FishSpeciesData`, `PlantSpecies`, `PlantSpeciesData`, `GrowthForm`, `GrowthFormData`, `FishBreedingData` | What each species is: tolerance bands, hardiness, growth, lifespan, breeding, and what one full unit of a plant's growth form is |
| Read the flora law | `FloraTraits`, `plantTraits`, `saturationIrradiance`, `dailyLightEdge`, `floraPace`, `TISSUE_PER_RATE_UNIT`, `shedShare`, `FloraLoss` | The traits a plant species and a bloom are both written in — `plantTraits` reads a species into them — the PAR each saturates at and its rated day, the pace its tissue lives at, the grams in a rate unit of tissue, and the share low condition sheds and what losses leave — waste, and a dead flora's leached stores |
| Build and read equipment | `FILTER_SPECS`, `FILTER_SURFACE`, `SUBSTRATE_SURFACE_PER_LITER`, `SUBSTRATE_ORGANIC_PER_LITER`, `SUBSTRATE_KH_RESERVE_PER_LITER`, `SUBSTRATE_NUTRIENTS_PER_LITER`, `HARDSCAPE_SURFACE`, `HARDSCAPE_TANNINS`, `createHardscapeItem`, `POWERHEAD_FLOW_RATES`, `HEATER_WATTAGE_OPTIONS`, `LIGHT_PAR_OPTIONS`, `LID_MULTIPLIERS`, `getFilterFlow`, `getSubstrateSurface`, `getSubstrateNutrients`, `calculateBedLeak`, `calculateParAtDepth`, `scheduledLightByHour`, `scheduledLightHistory`, `dailyLightIntegral`, `rescape`, `placeHardscape`, `liftHardscape`, `resetHardscape`, `disturbBed` | Every device catalog, and the functions that turn a device into the surface, flow and light the tank gets — by the hour and over the day — what a fresh bed of a type holds for roots, and what a bed leaks an hour |
| Size a tank | `calculateTankHeight`, `calculateFloorArea`, `calculateTankGlassSurface`, `calculateHardscapeSlots` | The geometry a capacity implies — depth for the light calculation, floor for the planting, glass area for the colony, slots for the scape |
| Run schedules | `DailySchedule`, `isScheduleActive`, `isValidSchedule`, `formatSchedule` | The start-hour-plus-duration shape every scheduled device uses, and the check for whether it is on |
| Watch for trouble | `checkAlerts`, `alerts`, `Alert`, `AlertResult`, `bloomAlert`, `bloomAlerts`, `bloomLevel`, `BloomLevel`, `waterLevelAlertLine`, `PLANT_LIGHT_LINE`, `BLOOM_COVERAGE_LINE`, `BLOOM_VISIBLE_LINE`, `bloomShows`, `FREE_AMMONIA_EDGE`, `NITRITE_EDGE`, `NITRATE_EDGE`, `OXYGEN_EDGE`, `OXYGEN_COMFORT`, `toleranceFactor` | The alerts a tick raises, one per kind of bloom among them; the lines the water level, each bloom — by the plants' light it takes and its coverage, read as a `BloomLevel` — free ammonia, nitrite, nitrate and oxygen alert at, and the coverage a bloom shows from, and whether one does; how far hardiness carries a fish's own edge past them; and where the O₂ benefit is full |
| Read the log | `LogEntry`, `LogSeverity`, `LogEvent`, `LogQuantity`, `LogText`, `QuantityFormat`, `createLog`, `measured`, `liters`, `celsius`, `coverage`, `logText`, `metricQuantity` | The event stream a tick appends to, and the constructor for a host's own entries. A line's volumes, temperatures and a die-back's coverage stay quantities — built with `` measured`…${liters(x)}…` `` — and `logText(entry, format)` reads it in the host's units, metric by default |
| Weigh organic matter | `Organics`, `NO_ORGANICS`, `addOrganics`, `scaleOrganics`, `ofComposition`, `atRecipe`, `foodRecipe`, `RecipeConfig` | Organic matter as waste and mulm hold it — grams and the N, P, K and Fe inside them — pooled, scaled, or built at a composition or at food's recipe |
| Reproduce a run | `RngState` | The seed and stream position every draw comes off. Serialize it and the tank replays exactly |
| Reach into a tick | `System`, `coreSystems`, `Effect`, `EffectTier`, `applyEffects`, `processFlora`, `FloraProcessingResult`, `processLivestock`, `processBodies`, `BloomHour`, `offerCarbon`, `plantFixer`, `CarbonFixer`, and the per-system calculators | The tick's own machinery, to measure one step of the hour. `processFlora` runs plants and every bloom in one pass, returning each one's vitality, light and budget fluxes, and the stores' uptake from the water — the plants' summed, each bloom's its own, with its spores and the exudates' hold; `processLivestock` every fish's budget, feeding and health, with each one's hour and vitality, and `processBodies` the clutches, broods and males' buffers after it, with what they burn and leave as `Organics`; `offerCarbon` gives every carbon fixer its share of one CO₂ stock |

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

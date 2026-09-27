---
title: "Tunables"
description: "The engine's adjustable constants, grouped by module, with what each one means and the unit it carries."
---

A tunable is a claim about how real aquariums behave, held apart from the code
that reads it. All of them live in `src/simulation/config/`, addressed as
`section.key`.

Every tunable declares its own metadata alongside its default — a label, a unit,
a spinner step and, for everything but the derived nitrification rates, a
`min`/`max`. Two writers consult that range: the CLI refuses a `config set`
outside it, and the tunables drawer holds its field to it. The save path does
not — its bounds are hand-written per leaf and mostly assert shape rather than
range, so a stored `digestionRate` of −1 loads without complaint against a
declared minimum of `0.01`.

## Sections

| Section | Path prefix | Governs |
|---|---|---|
| Decay | `decay.` | Food to waste, waste to ammonia, and the bed's leach |
| Nitrogen cycle | `nitrogenCycle.` | The three-stage chain and the two nitrifier guilds |
| Gas exchange | `gasExchange.` | O₂ and CO₂ across the surface, and what aeration does to both |
| Temperature | `temperature.` | Drift toward the room, scaled by tank size |
| Evaporation | `evaporation.` | Water lost per day, and how warmth accelerates it |
| Algae | `algae.` | What thriving plants do to any bloom; a bloom's own kind is its traits, and the rest of it runs on `plants.` |
| Optics | `optics.` | What the water column, the blooms and the leaves above take out of the light on the way down |
| Water chemistry | `waterChemistry.` | What calcite, driftwood and aqua soil do to KH and GH |
| Plants | `plants.` | Photosynthesis, respiration, vitality, growth and offshoots, lifecycle |
| Nutrients | `nutrients.` | Fertilizer formula, root tab, the bed's leak, half-saturations, demand tiers, minerals in organic matter |
| Livestock | `livestock.` | Feeding, metabolism, vitality, growth and broods, death |

The values themselves are not repeated here. They move when the model is
recalibrated, and the file that holds each one carries the reference it was read
off — which is the part that makes a number checkable.

## Decay

| Tunable | Meaning | Unit |
|---|---|---|
| `q10` | Factor every decay rate multiplies by per 10 °C | — |
| `referenceTemp` | Temperature the base rate is quoted at | °C |
| `baseDecayRate` | Share of standing food that decomposes per hour — a Monod maximum | /hr |
| `wasteConversionRatio` | Share of decaying food that becomes solid waste; the rest releases its N and minerals straight to the water | — |
| `gasExchangePerGramDecay` | Oxygen the decomposers demand per gram oxidised; their CO₂ derives from it | mg O₂/g |
| `oxygenHalfSaturation` | Dissolved O₂ at which decomposition runs at half rate | mg/L |
| `substrateLeachRate` | Share of the bed's remaining organic reserve released per hour | /hr |
| `wasteSettlingRate` | Share of standing waste settling into the bed per hour in still water | /hr |
| `settlingHalfTurnover` | Tank turnovers per hour at which flow halves settling | turnovers/hr |

## Nitrogen cycle

| Tunable | Meaning | Unit |
|---|---|---|
| `wasteConversionRate` | Share of standing waste mineralized to ammonia per tick | /tick |
| `bacteriaProcessingRate` | Ammonia one bacteria unit oxidises per tick, at saturating oxygen | mg/unit/tick |
| `seedingRate` | Nitrifiers settling into the tank per litre of water per tick, each guild | units/L/tick |
| `aobGrowthRate` | AOB per-capita growth at full utilization | /tick |
| `nobGrowthRate` | NOB per-capita growth at full utilization | /tick |
| `bacteriaPerCm2` | Biofilm carrying capacity — the colony's ceiling per cm² of surface | units/cm² |
| `bacteriaDeathRate` | Maintenance loss, charged whether or not the colony is working | /tick |
| `q10` | Factor every nitrifier rate multiplies by per 10 °C | — |
| `referenceTemp` | Temperature the nitrifier rates are quoted at | °C |
| `aobOxygenHalfSaturation` | Dissolved O₂ at which AOB oxidise and grow at half rate | mg/L |
| `nobOxygenHalfSaturation` | Dissolved O₂ at which NOB oxidise and grow at half rate | mg/L |
| `aobAmmoniaHalfSaturation` | Total ammonia, as NH₃, at which AOB oxidise at half rate | ppm |
| `nobNitriteHalfSaturation` | Nitrite, as NO₂⁻, at which NOB oxidise at half rate | ppm |

The four half-saturation constants are measured concentrations and carry a range.
The ten leaves above them were never given bounds, so a writer that asks
gets nothing back. A test asserts exactly that split, so the gap is stated
rather than discovered.

A bacteria unit is 10⁶ cells, which is what makes `bacteriaPerCm2` a biofilm
density you can look up rather than a score.

## Gas exchange

| Tunable | Meaning | Unit |
|---|---|---|
| `atmosphericCo2` | CO₂ concentration the water equilibrates toward | mg/L |
| `o2SaturationBase` | O₂ saturation at the reference temperature | mg/L |
| `o2SaturationSlope` | Change in O₂ saturation per °C — warmer water holds less | mg/L/°C |
| `o2ReferenceTemp` | Temperature the saturation base is quoted at | °C |
| `baseExchangeRate` | Share of the gap to equilibrium crossed per tick at optimal flow | /tick |
| `optimalFlowTurnover` | Tank turnovers per hour at which exchange is maximal | ×/hr |
| `minFlowFactor` | Floor on the flow factor — still-surface diffusion, so a filterless tank still breathes | × |
| `aerationExchangeMultiplier` | Multiplier on the exchange rate while aeration runs | × |
| `aerationDirectO2` | O₂ injected directly by bubble dissolution | mg/L/hr |
| `aerationCo2OffgasMultiplier` | Extra CO₂ off-gassing while aerating | × |

## Temperature

| Tunable | Meaning | Unit |
|---|---|---|
| `coolingCoefficient` | Drift toward the room per °C of difference, at the reference volume | °C/hr/°C |
| `referenceVolume` | Volume the cooling coefficient is quoted at | L |
| `volumeExponent` | How drift scales with volume — the surface-to-volume ratio | — |
| `roomDailySwing` | How far the room runs above and below its mean over the day | °C |
| `lightWarmingPerPar` | Warming a lit fixture adds to the temperature the water drifts toward, per surface PAR | °C/PAR |

## Evaporation

| Tunable | Meaning | Unit |
|---|---|---|
| `baseRatePerDay` | Share of standing water lost per day at thermal equilibrium | % |
| `tempDoublingInterval` | Warmth above the room that doubles the rate | °C |

## Algae

Both kinds of bloom run on the plants' constants, and what a kind is — its
habitat, its pace, its carbon, nitrogen and phosphorus affinities, its tissue,
its spores — sits in its traits, beside the plant species
([Algae](/subsystems/algae/#key-tunables-and-traits)). What is left here holds
for every kind.

| Tunable | Meaning | Unit |
|---|---|---|
| `allelopathySeverity` | Damage per rate unit of thriving plant per litre | %/(unit/L)/hr |

## Optics

| Tunable | Meaning | Unit |
|---|---|---|
| `waterAttenuationPerCm` | Beer–Lambert attenuation of the water column, per cm of depth | /cm |
| `leafAttenuationPerLai` | Beer–Lambert extinction of a canopy, per unit of leaf area index; at 0 leaves shade nothing and a plant reads the water alone | /LAI |
| `algaeAttenuationPerGram` | Beer–Lambert extinction per gram of algal tissue crossed, per cm² — green water's in the column, film's as a coat on every leaf; at 0 a bloom shades nothing | cm²/g |

## Water chemistry

| Tunable | Meaning | Unit |
|---|---|---|
| `calciteDissolutionRate` | CaCO₃ one calcite rock dissolves per hour at pH 7, scaled by [H⁺] | mg/h |
| `tanninLeachRate` | Share of a driftwood piece's remaining tannins leached per hour | /h |
| `aquaSoilKhUptake` | Share of the tank's KH a fresh aqua soil bed takes up per hour, scaled by the buffer left — and as much GH with it | /h |

## Plants

| Tunable | Meaning | Unit |
|---|---|---|
| `basePhotosynthesisRate` | Rate one rate unit — 500 cm² of leaf at growth rate 1 — fixes carbon at, under ideal conditions | /hr |
| `lowCo2HalfSaturation` · `mediumCo2HalfSaturation` · `highCo2HalfSaturation` | CO₂ at which a species of each carbon need photosynthesises at half rate | mg/L |
| `saturationIrradianceFactor` | Multiple of a species' band low at which its light response saturates | × band low |
| `co2PerRateUnit` | CO₂ carried by one rate unit; oxygen derives from it at the molar ratio | mg |
| `baseRespirationRate` | Dark respiration per rate unit of leaf at growth rate 1, running around the clock | /hr |
| `respirationQ10` | Factor respiration and light starvation multiply by per 10 °C | — |
| `respirationReferenceTemp` | Temperature respiration and light starvation are quoted at | °C |
| `respirationOxygenHalfSaturation` | Dissolved O₂ at which respiration runs at half rate | mg/L |
| `growthDrawRate` | First-order rate the bank draws toward new tissue at, before the taper `1 − size/100` | /hr |
| `healingDrawRate` | First-order rate the bank heals condition at, per unit of species growth rate | /hr per growth rate |
| `sizePerSurplus` | Size gained per bank point converted, before the species growth multiplier — the conversion growth and offshoots share | %/pt |
| `surplusCap` | Ceiling on the bank; a full one buys an offshoot | pts |
| `tissuePerSize` | Organic matter in a % of a rate unit of tissue, so a unit weighs by its leaf, not its size — what growth draws the recipe for, and shedding and death return as waste | g/% |
| `lightStarvationSeverity` | Damage in a day without light, falling to nothing at the species' daily light edge; quoted at growth rate 1 and the respiration reference temperature | %/hr |
| `lightExcessiveSeverity` | Damage per PAR unit above the species' tolerable band | %/PAR/hr |
| `temperatureStressSeverity` · `phStressSeverity` · `ghStressSeverity` | Damage per unit outside the species' tolerable band, one per factor | %/unit/hr |
| `nutrientDeficiencySeverity` · `sufficiencyEdge` | Damage at a Liebig sufficiency of 0 under saturating light, falling linearly to nothing at the edge; and the sufficiency a plant counts as fed, since a Monod share never reaches 1 | %/hr · — |
| `nitrateStressSeverity` · `nitrateEdge` | Damage per e-fold of NO₃ past the plant's own edge, and where a hardiness-0 plant's edge sits | %/e-fold/hr · ppm |
| `co2BenefitPeak` · `temperatureBenefitPeak` · `phBenefitPeak` | Recovery earned per factor at its best — temperature and pH at the band's centre; all three run on the light term times the Liebig sufficiency | %/hr |
| `maxSheddingRate` | Share of itself a plant sheds per hour at condition 0, falling with the square of the deficit | /hr |

Every severity above is pre-hardiness. The species' own hardiness scales every
channel by `1 − hardiness` except nitrate, whose edge it carries out instead.

## Nutrients

| Tunable | Meaning | Unit |
|---|---|---|
| `fertilizerFormula.nitrate` · `.phosphate` · `.potassium` · `.iron` | The all-in-one fertilizer's composition per ml | mg/ml |
| `rootTab.nitrate` · `.phosphate` · `.potassium` · `.iron` | What one root tab pushes into the bed | mg |
| `bedLeakRate` | Share of each nutrient the bed holds that leaks into the water per hour | /hr |
| `halfSaturation.ammonia` · `.nitrate` · `.phosphate` · `.potassium` · `.iron` | The ppm of each form — total ammonia as NH₃ — at which a full-demand plant takes it at half its need for the nutrient it carries | ppm |
| `demand.low.*` · `demand.medium.*` · `demand.high.*` | Each tier's share of the full need, per nutrient; scales the half-saturation of every form the nutrient comes in, ammonia's by nitrate's | — |
| `foodMineralContent.phosphate` · `.potassium` · `.iron` | Minerals in a gram of food, in the waste it becomes, and in plant tissue | mg/g |

## Livestock

| Tunable | Meaning | Unit |
|---|---|---|
| `gutCapacity` | Food a full gut holds, per gram of fish | g/g |
| `digestionRate` | First-order rate a gut digests at, at the reference temperature in unlimited oxygen | /hr |
| `metabolicQ10` · `metabolicReferenceTemp` | How the metabolism — digestion and the maintenance ration — scales with temperature, and where it reads their base values | — · °C |
| `maintenanceRation` | Food a day, per gram of fish, digested to hold condition at the reference temperature in unlimited oxygen — income at half rate, and where hunger starts | g/g/day |
| `hungerSeverity` | Damage at an empty gut, before hardiness | %/hr |
| `baseRespirationRate` | Oxygen a fish draws per gram per hour — a Monod maximum | mg O₂/g/hr |
| `respirationOxygenHalfSaturation` | Dissolved O₂ at which uptake falls to half; it scales digestion and the maintenance ration too | mg/L |
| `foodNitrogenFraction` | Share of food mass that is nitrogen — eaten, decayed, or mineralized as waste | g N/g food |
| `gillNFraction` | Share of digested nitrogen excreted straight through the gills; the rest leaves as feces | — |
| `respiratoryQuotient` | Moles of CO₂ exhaled per mole of O₂ consumed | — |
| `temperatureStressSeverity` · `phStressSeverity` · `ghStressSeverity` | Damage per unit outside the species' tolerable band | %/unit/hr |
| `ammoniaStressSeverity` · `nitriteStressSeverity` · `nitrateStressSeverity` · `oxygenStressSeverity` | Damage per e-fold past the fish's own tolerance edge, which hardiness moves out — free NH₃, not total ammonia; oxygen counts e-folds under | %/e-fold/hr |
| `waterLevelStressSeverity` · `flowStressSeverity` | Damage per unit of deviation | %/unit/hr |
| `ageStressSeverity` | Damage per hour lived past the species' `maxAge`, climbing with the excess | %/(h past maxAge)/h |
| `waterLevelStressThreshold` | Share of capacity the water-level stressor switches on under | % |
| `phBenefitPeak` · `oxygenBenefitPeak` · `plantBenefitPeak` | Recovery earned per factor at its best, at full nourishment | %/hr |
| `plantBenefitSaturationPoint` | Plant power at which the planted-tank benefit stops growing | power |
| `surplusCap` | Ceiling on the fish's bank; a female broods on a full one | pts |
| `healingDrawRate` | First-order rate a 1 g fish's bank heals it at, scaled by adult mass to the −¼ | /hr at 1 g |
| `growthDrawRate` | First-order rate the bank draws toward growth at, before the growth share `1 − size / 100` | /hr |
| `sizePerSurplus` | Size, in % of adult mass, a bank point buys at species growth rate 1 | %/pt |
| `broodCost` | Bank points a brood of its parent's own weight costs the parent — the female in full, the male at his species' share | pts per body mass |
| `eggSensitivity` | How many times harder the water harms an egg than a fish, as a share of the clutch an hour | × |
| `eggPredationRate` | Share of a clutch an hour one gram of fish per litre eats, before the clutch's exposure | L/g/hr |
| `deathDecayFactor` | Share of a dead fish's mass that becomes waste | — |

## Fixed tables

Not everything numeric is tunable. These are catalogs rather than calibration:
they describe what a thing *is*, so they ship as plain constants and no writer
can move them at runtime.

| Table | Holds |
|---|---|
| Fish species | Per species: adult mass, growth rate, lifespan, hardiness, temperature / pH / flow tolerance bands, and a breeding block — mode, development time, clutch exposure, egg mass, fry mass, the male's share of a brood |
| Plant species | Per species: growth rate, growth form, hardiness, CO₂ requirement, nutrient demand tier, and the PAR band it tolerates, whose low end sets the daily light it starves under |
| Growth forms | Per form: what one full unit is — its height and how height grows with size, its footprint, its leaf area index — the share of its food it draws through its roots, and what its offshoot is called |
| Filters | Per type: biological surface, target turnover, flow ceiling, tank-size ceiling, and whether it is air-driven |
| Substrates | Per type: colony surface per litre, and the organic and KH reserves and the nutrient charge a fresh bed holds per litre |
| Hardscape | Per type: colony surface, and the tannins a fresh piece carries |
| Lids | Per type: the multiplier applied to evaporation |
| Fixtures and pumps | The catalog of ratings a device can be built with — heater wattages, light PAR ratings, powerhead flow rates, CO₂ bubble rates, doser amounts |
| Chemistry | Molecular weights and the mass ratios derived from them, the degree-to-CaCO₃ conversion shared by dKH and dGH, and the CaCO₃ in an equivalent with the protons each nitrogen process moves. Derived, never quoted twice |

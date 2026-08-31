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
outside it, and the debug panel makes it the slider's ends. The save path does
not — its bounds are hand-written per leaf and mostly assert shape rather than
range, so a stored `satiationDecayRate` of −1 loads without complaint against a
declared minimum of `0.1`.

## Sections

| Section | Path prefix | Governs |
|---|---|---|
| Decay | `decay.` | Food to waste, waste to ammonia, and the bed's leach |
| Nitrogen cycle | `nitrogenCycle.` | The three-stage chain and the two nitrifier guilds |
| Gas exchange | `gasExchange.` | O₂ and CO₂ across the surface, and what aeration does to both |
| Temperature | `temperature.` | Drift toward the room, scaled by tank size |
| Evaporation | `evaporation.` | Water lost per day, and how warmth accelerates it |
| Algae | `algae.` | The bloom's stressors, benefits and mass dynamics |
| Optics | `optics.` | What the water column takes out of the light on the way down |
| pH | `ph.` | Hardscape targets, the CO₂ coupling, the drift rate |
| Plants | `plants.` | Photosynthesis, respiration, vitality, growth, lifecycle |
| Nutrients | `nutrients.` | Fertilizer formula, optimal concentrations, demand tiers |
| Livestock | `livestock.` | Metabolism, satiation, vitality, death |

The values themselves are not repeated here. They move when the model is
recalibrated, and the file that holds each one carries the reference it was read
off — which is the part that makes a number checkable.

## Decay

| Tunable | Meaning | Unit |
|---|---|---|
| `q10` | Factor every decay rate multiplies by per 10 °C | — |
| `referenceTemp` | Temperature the base rate is quoted at | °C |
| `baseDecayRate` | Share of standing food that decomposes per hour — a Monod maximum | /hr |
| `wasteConversionRatio` | Share of decaying food that becomes solid waste | — |
| `gasExchangePerGramDecay` | Oxygen the decomposers demand per gram oxidised; their CO₂ derives from it | mg O₂/g |
| `oxygenHalfSaturation` | Dissolved O₂ at which decomposition runs at half rate | mg/L |
| `substrateLeachRate` | Share of the bed's remaining organic reserve released per hour | /hr |

## Nitrogen cycle

| Tunable | Meaning | Unit |
|---|---|---|
| `wasteConversionRate` | Share of standing waste mineralized to ammonia per tick | /tick |
| `wasteToAmmoniaRatio` | Ammonia yielded per gram of waste | mg/g |
| `bacteriaProcessingRate` | Ammonia one bacteria unit oxidises per tick, at saturating oxygen | mg/unit/tick |
| `aobSpawnThreshold` | Ammonia concentration at which the AOB guild appears | ppm |
| `nobSpawnThreshold` | Nitrite concentration at which the NOB guild appears | ppm |
| `inoculumPerLiter` | Nitrifiers a tank is born with, per litre of fill water | units/L |
| `aobGrowthRate` | AOB per-capita growth at full utilization | /tick |
| `nobGrowthRate` | NOB per-capita growth at full utilization | /tick |
| `bacteriaPerCm2` | Biofilm carrying capacity — the colony's ceiling per cm² of surface | units/cm² |
| `bacteriaDeathRate` | Maintenance loss, charged whether or not the colony is working | /tick |
| `q10` | Factor every nitrifier rate multiplies by per 10 °C | — |
| `referenceTemp` | Temperature the nitrifier rates are quoted at | °C |
| `aobOxygenHalfSaturation` | Dissolved O₂ at which AOB oxidise and grow at half rate | mg/L |
| `nobOxygenHalfSaturation` | Dissolved O₂ at which NOB oxidise and grow at half rate | mg/L |

The two half-saturation constants are measured concentrations and carry a range.
The twelve leaves above them were never given bounds, so a writer that asks
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

## Evaporation

| Tunable | Meaning | Unit |
|---|---|---|
| `baseRatePerDay` | Share of standing water lost per day at thermal equilibrium | % |
| `tempDoublingInterval` | Warmth above the room that doubles the rate | °C |

## Algae

| Tunable | Meaning | Unit |
|---|---|---|
| `hardiness` | Tolerance factor multiplied through every stressor centrally | — |
| `suppressionThreshold` | Plant power above which established plants push the bloom back | power |
| `plantSuppressionSeverity` | Damage per unit of plant power above that threshold | %/power/hr |
| `weaknessThreshold` | Plant power below which a weak planting becomes a benefit to algae | power |
| `lightExcessThreshold` | Substrate PAR above which light stops being what plants use and starts feeding algae | PAR |
| `excessLightPeak` · `excessLightSeverity` | The excess-light benefit: its ceiling, and its rate per PAR over the threshold | %/hr · %/PAR/hr |
| `excessNutrientPeak` · `excessNutrientSeverity` | The excess-nutrient benefit, against the larger of the NO₃ and PO₄ ratios over optimum | %/hr · %/ratio/hr |
| `nutrientDeficiencyPeak` · `nutrientDeficiencySeverity` | The starved-plants benefit — deliberately small, a canary rather than a lever | %/hr · %/(1−ratio)/hr |
| `lowPlantPowerPeak` · `lowPlantPowerSeverity` | The weak-planting benefit, per unit of power below `weaknessThreshold` | %/hr · %/power/hr |
| `algaeGrowthPerTickCap` | Ceiling on surplus spent turning into mass in one tick | surplus |
| `massPerSurplus` | Mass gained per surplus unit drained | % |
| `surplusCap` | Saturation cap on the bloom's reserve bank | % |

## Optics

| Tunable | Meaning | Unit |
|---|---|---|
| `waterAttenuationPerCm` | Beer–Lambert attenuation of the water column, per cm of depth | /cm |

## pH

| Tunable | Meaning | Unit |
|---|---|---|
| `calciteTargetPh` | The pH calcite rock pulls toward | — |
| `driftwoodTargetPh` | The pH driftwood pulls toward | — |
| `neutralPh` | The pH a tank with no hardscape sits at | — |
| `basePgDriftRate` | Share of the gap to the hardscape target crossed per tick | /tick |
| `co2PhCoefficient` | pH change per decade of CO₂ change away from neutral | pH/decade |
| `co2NeutralLevel` | CO₂ concentration at which the coupling contributes nothing | mg/L |
| `hardscapeDiminishingFactor` | Falloff applied to each additional item of the same hardscape | — |

## Plants

| Tunable | Meaning | Unit |
|---|---|---|
| `basePhotosynthesisRate` | Rate one unit of plant size fixes carbon at, under ideal conditions | /hr |
| `optimalCo2` | CO₂ at which the carbon term saturates | mg/L |
| `optimalNitrate` | Nitrate the growth term is quoted against | ppm |
| `saturationIrradianceFactor` | Multiple of a species' band low at which its light response saturates | × band low |
| `nutrientsPerPhotosynthesis` | Total nutrients drawn per unit of potential photosynthesis, split by the fertilizer ratio | mg |
| `co2PerRateUnit` | CO₂ carried by one rate unit; oxygen derives from it at the molar ratio | mg |
| `baseRespirationRate` | Dark respiration per unit of plant size, running around the clock | /hr |
| `respirationQ10` | Factor respiration multiplies by per 10 °C | — |
| `respirationReferenceTemp` | Temperature respiration and upkeep are quoted at | °C |
| `respirationOxygenHalfSaturation` | Dissolved O₂ at which respiration runs at half rate | mg/L |
| `growthDrawRate` | Share of the reserve bank mobilised toward new tissue each lit hour | /hr |
| `sizePerSurplus` | Size gained per surplus unit converted, before the species growth multiplier | % |
| `surplusCap` | Saturation cap on the reserve bank | % |
| `upkeepCost` | Cost per hour of simply being alive, quoted at the respiration reference temperature | %/hr |
| `upkeepReserveHours` | Hours of upkeep the bank keeps back from damage — the survival rations | hr upkeep |
| `lightInsufficientSeverity` · `lightExcessiveSeverity` | Damage per PAR unit below and above the species' tolerable band | %/PAR/hr |
| `co2InsufficientSeverity` · `temperatureStressSeverity` · `phStressSeverity` | Damage per unit outside the species' tolerable band, one per factor | %/unit/hr |
| `nutrientDeficiencySeverity` | Damage per unit of missing sufficiency, Liebig-gated | %/(1−suff)/hr |
| `nutrientToxicitySeverity` · `nutrientToxicityThresholdNitrate` | The gross-overdose channel: what it costs per ppm past the threshold, and where that threshold starts | %/ppm/hr · ppm |
| `algaeShadingSeverity` · `algaeShadingThreshold` | Damage per point of bloom past the threshold, and the mass above which algae shades plants | %/algae/hr · — |
| `co2BenefitPeak` · `temperatureBenefitPeak` · `phBenefitPeak` · `nutrientBenefitPeak` | Recovery earned per factor in its tolerable band; all four are scaled by the light term | %/hr |
| `maxSheddingRate` | Share of itself a plant sheds per hour when it can pay none of its upkeep | /hr |
| `wastePerShedSize` · `wastePerPlantDeath` | Waste produced per unit of size shed, and per unit of size on death | g/% |
| `deathConditionThreshold` · `deathSizeThreshold` | Condition and size below which a plant dies | % |

Every severity above is pre-hardiness. The species' own hardiness multiplies the
sum once, centrally, rather than each channel scaling itself.

## Nutrients

| Tunable | Meaning | Unit |
|---|---|---|
| `fertilizerFormula.nitrate` · `.phosphate` · `.potassium` · `.iron` | The all-in-one fertilizer's composition per ml. Plants consume in the same ratio | mg/ml |
| `optimalNitratePpm` · `optimalPhosphatePpm` · `optimalPotassiumPpm` · `optimalIronPpm` | The concentration each nutrient reaches full sufficiency at | ppm |
| `lowDemandMultiplier` · `mediumDemandMultiplier` · `highDemandMultiplier` | Share of optimal each species demand tier actually needs | — |
| `phosphatePerDecay` | Phosphate mineralized per gram of organic matter decayed | mg/g |

## Livestock

| Tunable | Meaning | Unit |
|---|---|---|
| `baseFoodRate` | Food a fish ingests per gram of body mass per hour | g/g/hr |
| `baseRespirationRate` | Oxygen a fish draws per gram per hour — a Monod maximum | mg O₂/g/hr |
| `respirationOxygenHalfSaturation` | Dissolved O₂ at which uptake falls to half; it scales the ammonia streams too | mg/L |
| `foodNitrogenFraction` | Share of ingested food mass that is nitrogen | g N/g food |
| `gillNFraction` | Share of ingested nitrogen excreted straight through the gills; the rest leaves as feces | — |
| `basalAmmoniaRate` | Gill ammonia from body protein turnover, produced whether or not the fish ate | mg NH₃/g/hr |
| `respiratoryQuotient` | Moles of CO₂ exhaled per mole of O₂ consumed | — |
| `satiationDecayRate` | Satiation lost per hour, feeding or not | %/hr |
| `temperatureStressSeverity` · `phStressSeverity` | Damage per unit outside the species' tolerable band | %/unit/hr |
| `ammoniaStressSeverity` | Damage per ppm of *unionized* ammonia, not total TAN | %/ppm free NH₃/hr |
| `nitriteStressSeverity` · `nitrateStressSeverity` · `oxygenStressSeverity` · `waterLevelStressSeverity` · `flowStressSeverity` | Damage per unit of deviation, one per water-quality channel | %/unit/hr |
| `ageStressSeverity` | Damage per hour lived past the species' `maxAge`, climbing with the excess | %/(h past maxAge)/h |
| `nitrateStressThreshold` · `oxygenStressThreshold` · `waterLevelStressThreshold` | The reading each of those stressors switches on at | ppm · mg/L · % |
| `satiationOverfedFloor` · `satiationWellFedFloor` · `satiationHungryCeiling` · `satiationStarvingCeiling` | The four edges dividing the satiation axis into overfed, well-fed, peckish, hungry and starving | % |
| `satiationOverfedSeverity` · `satiationHungrySeverity` · `satiationStarvingSeverity` | Peak cost of each stressed band; the curve interpolates between the anchors | %/hr |
| `satiationWellFedPeak` · `phBenefitPeak` · `oxygenBenefitPeak` · `plantBenefitPeak` | Recovery earned per factor in its good band | %/hr |
| `plantBenefitSaturationPoint` | Plant power at which the planted-tank benefit stops growing | plants |
| `surplusCap` | Saturation cap on the fish's reserve bank | % |
| `deathDecayFactor` | Share of a dead fish's mass that becomes waste | — |

## Fixed tables

Not everything numeric is tunable. These are catalogs rather than calibration:
they describe what a thing *is*, so they ship as plain constants and no writer
can move them at runtime.

| Table | Holds |
|---|---|
| Fish species | Per species: adult mass, lifespan, hardiness, temperature / pH / flow tolerance bands, and a full breeding block — mode, clutch size, spawn cost, hatch time, maturity age |
| Plant species | Per species: growth rate, max size, hardiness, CO₂ requirement, substrate requirement, nutrient demand tier, and the PAR band it tolerates |
| Filters | Per type: biological surface, target turnover, flow ceiling, tank-size ceiling, and whether it is air-driven |
| Substrates | Per type: colony surface per litre, and the organic reserve a fresh bed holds per litre |
| Hardscape | Per type: colony surface, and the pH it pulls toward |
| Lids | Per type: the multiplier applied to evaporation |
| Fixtures and pumps | The catalog of ratings a device can be built with — heater wattages, light PAR ratings, powerhead flow rates, CO₂ bubble rates, doser amounts |
| Chemistry | Molecular weights and the mass ratios derived from them. Derived, never quoted twice |

# Changelog

All notable changes to this project will be documented in this file.

<!--
Format: - **Feature name** (#PR) - One short sentence (under ~150 chars)
- Group by date, newest first
- Skip UI-only tweaks and minor fixes
- Implementation details belong in the PR description, not here
-->

## Unreleased

- **Organic matter has a composition** (#79) - food, waste, mulm and bodies carry their carbon and nutrients and rot on one law; fish excrete their diet's excess; breaking (v38).
- **Fish carry toxin loads** (#78) - a per-toxin load follows the water at its dominant rate; health and appetite read it, a hatchling carries its clutch's; breaking (v37).
- **Flora run on energy budgets** (#77) - plants and blooms grow on a reserve and Droop nutrient stores, starve on reserve in the dark; breaking (v36).
- **Organic matter carries its nutrients** (#77) - waste and the bed's mulm keep the N, P, K and Fe of what made them; breaking: waste is Organics.
- **The console reads the budget** (#77) - reserve, stores and the next offshoot in the ledgers, foods against the stores; breaking: preset factory args.
- **Fish run on energy budgets** (#75) - fish grow, breed, starve and age on their species' Add-my-Pet DEB; breaking: `Fish` and livestock config reshaped (v35).
- **Predation** (#74) - larger fish hunt the young by the grams they outweigh them and eat what they kill; breaking (v34).
- **Eggs are a stock** (#74) - water and fish thin a clutch as it develops, and livebearers carry theirs; breaking (v34).
- **Feeding through a gut** (#74) - fish digest over hours, slower cold; breaking: `Fish.gut` replaces `satiation` (v34).
- **Auto feeder** (#74) - drops a set ration once a day at its hour (v34).
- **Auto doser keeps an hour** (#74) - breaking: `AutoDoser.startHour` replaces `schedule` (v34).
- **Actions settle the passive readings** (#73) - a verb re-reads light, flow, surface and aeration off the tank it leaves; breaking: `settlePassiveResources` replaces `relight`.
- **Nitrogen moves KH by its charge** (#73) - minted ammonia takes up a proton, so the cycle drains KH half as fast, and a cycled seed's KH pays for its nitrate while it lasts.
- **Flora take ammonia before nitrate** (#73) - plants and the blooms take their nitrogen as ammonia before nitrate, moving KH as they do; breaking (v33).
- **A plant lives at the rate it grows** (#73) - its leaf fixes, respires and starves at its growth rate, so a carpet melts in a blackout an anubias rides out.
- **Algae is a plant without a position** (#73) - green water and film grow on the plants' law, take their light and die back into waste; breaking (v33).
- **The bed is a nutrient store** (#71, #72) - aqua soil comes charged, root tabs refill any bed and it leaks into the water; swords and carpets feed partly through their roots; breaking (v32).
- **A plant is made of its nutrients** (#71) - growth draws its tissue's N, P, K and Fe from the water and the bed, and shedding and death return them; breaking (v32).
- **A plant dies only at condition 0** (#71) - a shrunken plant lives while it has condition, and plantings, trims and seeds run from `MIN_PLANTABLE_SIZE` to 100; breaking (v32).
- **A new tank opens on the optics it runs on** (#70) - `SimulationConfig.optics` lights its first day, and `relight` re-reads a tank at hour zero under others.
- **A feeding adds what it weighs** (#70) - the food stock keeps its real mass instead of rounding to 0.01 g.
- **One vitality model** (#70) - condition moves by benefit minus damage, banks only at 100, and the bank heals at a species share; breaking (v30).
- **Plants starve on the day's light** (#70) - starvation reads 24 h of PAR, and income runs on nutrient sufficiency; breaking (v31).
- **Plants are units of a growth form** (#70) - size is 0–100 of one unit, rated by leaf, lit at its own height and claiming floor by footprint; breaking (v31).
- **A full bank buys a plant an offshoot** (#70) - units carry family, age and vigour, and a family trims alone; breaking (v31).
- **Low condition sheds a plant** (#70) - with the square of the deficit, and shed or dead tissue fouls the water at one yield; breaking (v31).
- **Harm starts at an edge** (#70) - water quality on log dose past each organism's edge, comfort peaking mid-band, alerts where harm starts; breaking (v29).
- **Plant nutrition saturates** (#70) - per-nutrient Monod on species demand, and fish release only the nitrogen they ate; breaking (v29).
- **The planted preset injects like a keeper** (#70) - 0.5 bps holds CO₂ at 20–30 mg/L.
- **The console reads families, sickness and the day's light** (#70) - passes return what they computed, and log lines read in the keeper's units; breaking: such a log `message` holds `{0}`-style placeholders.
- **A cycled tank carries its stock** (#69) - a `'cycled'` colony is sized to the load its fish and bed put on it at rest, so a stocked tank opens without a mini-cycle; breaking.
- **Nitrifiers saturate on their substrate** (#69) - AOB and NOB oxidise at a Monod share of capacity, so a cycled tank holds hundredths of a ppm and a pulse stands until worked down.
- **The bed collects mulm** (#69) - standing waste settles into the bed's organic reserve, less in strong flow, and a water change can vacuum a share of it out.
- **Ammonia alerts on free NH₃** (#69) - fires at 0.02 ppm unionized ammonia, so the total-ammonia line moves with pH and temperature.
- **A rescape stirs the bed** (#69) - uprooting a plant or lifting hardscape releases a share of the bed's organics and scrapes its biofilm.
- **Nitrifiers seed, they don't spawn** (#69) - a per-litre trickle replaces the 0.5 ppm spawn gate, so every bed cycles, and a `'cycled'` colony is a share of the surface ceiling; breaking (v28).
- **A big, hard tank keeps its stock** (#68) - dissolved and organic masses have no fixed ceiling, so 10,000 L at 30 dKH is no longer clamped.
- **Carbon saturates, rooms breathe** (#68) - low CO₂ slows plants instead of hurting them; injected tanks reach 20–30 mg/L; rooms swing daily; breaking: `optimalCo2` → per-need half-saturations.
- **GH, general hardness** (#68) - calcium and magnesium as a tank stock from `tapGh`, moved with KH by calcite and soil, drawn by plants; fish and plants carry GH bands.
- **pH follows CO₂ and KH** (#68) - KH is a tank stock moved by tap water, nitrification and scape; breaking.
- **Scenario runner** (#67) - `npm run scenarios` runs preset tanks headless and grades each reading against real-tank bands; `--diff` shows what moved.
- **A retuned fertiliser formula reaches the bottle** (#66) - the manual dose and the auto-doser meter by the tuned formula plant uptake already read; breaking.
- **The dashboard is a console** (#66) - transport, rail, spine and widgets over one reading set, and any row opens the one inspector (v26).
- **Every constant is reachable** (#66) - the tunables drawer opens over any screen (⌘,) with a search; livestock and the fertiliser formula are in it at last.
- **Docs portal** (#64) - the whole system documented at docs.fishroom.app, linked from the dashboard.
- **A nutrient shortfall is pinned from both ends** (#63) - `nutrientDeficiencySeverity` 0.7 → 0.3, re-derived against the corrected photosynthate income.
- **A plant banks what it can't grow on** (#62) - growth draws a share of the reserve and withdraws only what became size, so a maxed plant fills its bank instead of burning it (v22).
- **A brighter fixture grows more plant, up to a point** (#61) - photosynthesis and the light benefit scale on `tanh(PAR/Ik)`, saturating at twice each species' band low; breaking: no `lightRequirement` (v21, v8).
- **A planted tank makes more oxygen than it burns** (#61) - `baseRespirationRate` 0.15 → 0.03, against the rate a tank on ambient carbon actually reaches.
- **A hypoxic fish excretes less nitrogen** (#60) - deamination is metabolism, so gill NH₃ carries the same oxygen factor as the respiratory draw; feces do not.
- **An under-aerated tank stands nitrite** (#60) - nitrification joins the oxygen-limited processes and pays 4.57 mg O₂ per mg N; NOB are the fussier guild, so the second step stalls before the first.
- **An aerobic process runs on the oxygen there is** (#60) - decay and plants scale their rate by `O2/(K+O2)`, so a suffocating tank stops emitting carbon it never paid for (v20, v7).
- **Gases move a mass, and carbon pays for the oxygen** (#60) - plants, fish, decay and the CO₂ line all meter against the water in the tank, at the molar ratio (v19, v6).
- **A 1000 W heater no longer destroys the tank** (#58) - the picker offered a wattage the save schema refused, and a refused save discards the tank.
- **`trace` rejects unknown fields** (#58) - a mistyped `--fields` name emitted a column of blanks that reads as absent data; the refusal names the valid set, and algae is on it.
- **`config set` takes a finite number or nothing** (#58) - `Infinity` and `1e309` were stored as strings that arithmetic turned back into `NaN`, and a typo'd path grew the config a key nothing reads.
- **A tunable is held to the range it declares** (#58) - `config set` and the tunables drawer read the leaf's own min/max, so a negative attenuation is refused.
- **Light is PAR, not watts** (#58) - a fixture is rated at the surface, the tank runs on what reaches the substrate, and depth comes from capacity (v18, v5).
- **A tank runs the same life twice** (#57) - a seed and counter on the state, so one `rngSeed` gives one life, ids too; breaking: no `generateFishId` (v17, v4).
- **The CLI rejects unknown flags** (#56) - `sim new --capacity=200` no longer builds the default tank and reports success; each subcommand names its flags.
- **Loading a preset starts a new tank** (#56) - a fresh simulation at tick 0, not a retrofit of the running one, and the dialog names what that costs.
- **Presets open cycled** (#56) - every preset but Bare Tank opens a month into its life: a working biofilter, a part-spent bed, and the nitrate to match.
- **A tank can start at a state** (#56) - `createSimulation` takes an optional `PresetSeed`: colony, bed, chemistry, fish at age and sex, plants at a size.
- **The community tank stops killing its tetras** (#55) - flow tolerance is a turnover: one powerhead is a current in a 300 L, lethal in a nano (v16, v3).
- **"Undersized" now means the flow cap bites** (#55) - a 55 gal on a HOB is no longer told it is underfiltered; a 150 gal on a canister is.
- **The device moving the water is the one that warns** (#55) - too much current names the powerhead, or the air pump, before the filter running behind it.
- **A rescape takes the biofilm** (#54) - a bed swap costs the colony the share that lived on the old bed, so an established tank blips.
- **The biofilter reads as cycled or uncycled** (#54) - both toxins at trace on colonies still clearing a load, so a starved tank stops claiming it.
- **Colonisation reads as headroom** (#54) - share of the surface ceiling is the room a colony has left, not the headline a healthy tank sat at 1 % of.
- **Processing capacity** (#54) - a bacterium clears the same ammonia in a nano as in a stock tank, and 18 °C takes twice the days to cycle that 25 °C does.
- **Nitrogen cycle** (#53) - a fresh tank cycles in about three weeks at any volume, on organics leaching from the bed; no biofilter dies for keeping up.
- **`processEquipment` requires a config** (#53) - breaking: the old default ran on `decayDefaults` whatever the caller tuned; `DEFAULT_CONFIG` is exported.
- **`formatDosePreview` removed from the public API** (#52) - breaking: string formatting living in the engine; the Flora section derives the preview now.
- **Action previews include dissolved gases** (#52) - water changes now show what they do to O₂ and CO₂, not just temperature and pH.
- **Preset drift is derived** (#52) - Setup's caption compares the tank against its preset's config, so an undo clears it and a reload cannot lose it.
- **Error boundary keeps your tank** (#52) - render errors show a recovery screen instead of wiping the save and reloading; reset is now an explicit button.
- **Fish reproduction** (#51) - a mature female spawns on a full bank beside a mature male, and the spawn empties it; livebearers drop fry, egg-layers lay clutches.
- **npm packaging** (#49) - publish-ready as `aquarium-simulator` v0.1.0: the build ships only the pure-TS engine, MIT license, trusted publishing.

## 2026-05-02

- **Algae as pure population** (#48) - algae drops `condition`, and its net rate drives mass directly.
- **Algae as a living organism** (#48) - algae becomes a peer organism on `state.algae` with vitality, surplus-driven growth and plant suppression (v12).

## 2026-05-01

- **Satiation bands** (#47) - a five-zone satiation model, Overfed to Starving, replaces the two-zone hunger model (v11).

## 2026-04-27

- **Game UI extracted** (#46) - moved `/game` to a separate non-open-source repo; engine, calibration CLI, and `src/ui/` untouched.
- **Remove pre-CLI calibration scaffolding** (#46) - deleted `src/simulation/calibration/`; the stateful `sim` CLI is now the canonical path.

## 2026-04-25

- **Plants-as-fish-benefit + FishCard Conditions** (#45) - fish vitality gains a fourth benefit (plants saturate at ~3 healthy mature plants, peak 0.2 %/h); FishCard mirrors PlantCard's Conditions block.

## 2026-04-24

- **Vitality model** (#45) - a unified damage/benefit/condition engine for plants and fish, with surplus-overflow growth and per-species hardiness (v6).
- **Plant biomass cap** (#44) - `PlantSpeciesData` gains per-species `maxSize`; growth applies an asymptotic throttle approaching the cap.
- **Per-plant trim** (#44) - `TrimPlantsAction` accepts an optional `plantId` for targeted trimming; Plants panel adds an inline slider per card.
- **Fish health legibility** (#43) - Livestock panel: trend arrow + expandable `▶ Stressors (N)` block on each fish card.

## 2026-04-23

- **Per-fish hardiness stochasticity** (#43) - `Fish.hardinessOffset` (±15 %) sampled at `addFish` so weaker individuals fail first (v5).

## 2026-04-19

- **Low-volume stressors calibration (S04)** (#42) - three 19 L variants; `temperatureStressSeverity` retuned 2.0 → 0.85.
- **Planted-equilibrium calibration (S02)** (#42) - photosynthesis refactored to per-plant Liebig sufficiency by demand tier; CO2→pH logarithmic; ambient waste tightened.
- **NOB/AOB stoichiometric asymmetry** (#42) - NOB nitrite-processing rate scales by molar-mass ratio so NO2 throughput matches AOB output in N-atom terms.
- **Uncycled quarantine calibration** (#42) - ammonia toxicity honors free-NH3 fraction (Emerson 1975); new `basalAmmoniaRate`; nitrification colonizes over weeks.
- **Filterless surface diffusion** (#42) - gas exchange gains a baseline diffusion floor (`minFlowFactor`); filterless tanks no longer collapse to zero exchange.
- **Gas exchange calibration** (#42) - fish respiration rate is an absolute mg O2/g/hr value, not a concentration delta; default 0.3.

## 2026-04-18

- **Fish gill ammonia excretion** (#42) - fish metabolism splits ingested food N (~80 % NH3 through gills, ~20 % feces); opaque `wasteRatio` replaced with the N-mass split.
- **Nitrogen-chain stoichiometry** (#42) - NH3 → NO2 → NO3 conserves N-mass with molecular-weight scaling (1 mg NH3 → 2.70 mg NO2 → 3.64 mg NO3).
- **Fish default hunger** (#42) - `addFish` initialises hunger to 30 (was 0) so new fish eat on the next feeding instead of letting food decay.
- **CLI waterChange arbitrary fractions** (#42) - `sim action waterChange` accepts any fraction in (0–1] or percent in (0–100].
- **Calibration CLI** (#42) - stateful `sim` CLI for agent-driven calibration; session persisted in `.simstate/current.json`.

## 2026-02-10

- **Simulation Calibration** (#41) - real-world calibration across 9 system groups (nitrogen cycle, gas exchange, temperature, evaporation, nutrients, plants, pH, livestock, decay).

## 2026-02-06

- **Fish Metabolism System** (#40) - individual fish (5 species) with metabolism, hunger, health stressors, and species hardiness; Livestock panel with controls.

## 2026-02-04

- **Game UI Foundation** (#39) - new game-like UI at `/game`; Pixi.js tank canvas; responsive layout; tabbed panels with Framer Motion.

## 2026-02-01

- **Nutrients and Dosing** (#38) - nutrient resources (PO4, K, Fe); plant condition system with shedding/death; dose action and auto doser equipment.
- **State Persistence** (#37) - centralized localStorage persistence with Zod schema validation; session restoration; `?reset` recovery query.

## 2026-01-30

- **Aeration System** (#33) - air pump equipment with auto-scaling; direct O2 injection from bubble dissolution; sponge filter inherently aerated.

## 2026-01-26

- **Plants System** (#32) - individual plant specimens (5 species) with photosynthesis, respiration, biomass distribution, overgrowth penalties, and trim action.

## 2026-01-25

- **Tunable Constants** (#31) - debug panel for runtime calibration of 38 simulation constants with localStorage persistence.

## 2026-01-21

- **Decay Mass Loss** (#30) - aerobic decay produces CO2, consumes O2; only 40 % becomes waste; smaller tanks more sensitive.

## 2026-01-17

- **pH System** (#26) - pH drifts toward equilibrium based on hardscape (calcite raises, driftwood lowers) and CO2; H+ blending for water changes and ATO.

## 2026-01-16

- **CO2 Generator Equipment** (#24) - configurable bubble rate (0.5–5.0 bps); schedule-based operation; integrates with gas exchange.
- **Gas Exchange System** (#24) - dissolved O2/CO2 equilibrate toward temperature-dependent saturation and atmospheric levels; rate scales with flow.

## 2026-01-15

- **Water Change Action** (#23) - removes proportional nitrogen mass; blends temperature toward tap water; ATO blends temperature when adding water.

## 2026-01-14

- **Nitrogen Cycle System** (#20) - three-stage biological conversion (waste → ammonia → nitrite → nitrate) via AOB/NOB; logistic growth limited by surface area.
- **Algae Growth and Scrub System** (#15) - algae grows based on light intensity per liter; Scrub action removes 10–30 %; high-algae alert at 80+.
- **Light Equipment and Schedule Module** (#12) - light fixture with photoperiod scheduling; reusable Schedule module for time-based equipment.

## 2026-01-13

- **Hardscape Equipment** (#10) - rocks, driftwood, decorations with bacteria surface area; slot system (2 per gallon, max 8).
- **Food, Decay, and Waste System** (#11) - food and waste resources with temperature-scaled decay (Q10 = 2); Feed action.
- **Surface, Flow, and Filtration Equipment** (#9) - Tank, Filter, Powerhead, Substrate with passive resources (surface area, water flow).
- **Lid and ATO Equipment** (#8) - Lid (none / mesh / full / sealed) reduces evaporation; ATO auto-maintains water level at 100 %.
- **Actions System** (#7) - user action infrastructure with Top Off action and Actions panel UI.
- **Logging System** (#6) - event logging with alerts, user action logs, and Log panel UI.

## 2026-01-12

- **UI Foundation** (#5) - React + Vite + Tailwind UI with timeline controls, equipment bar, and simulation integration.
- **Temperature, Evaporation, Heater** (#2) - environment/equipment state, temperature drift, evaporation, heater control.
- **Foundation** (#1) - simulation state, effect system, tick loop with Immer immutability.

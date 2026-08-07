# Changelog

All notable changes to this project will be documented in this file.

<!--
Format: - **Feature name** (#PR) - One short sentence (under ~150 chars)
- Group by date, newest first
- Skip UI-only tweaks and minor fixes
- Implementation details belong in the task file (`docs/tasks/XX.md`), not here
-->

## Unreleased

- **A brighter fixture grows more plant, up to a point** - photosynthesis and the light benefit both scale on `tanh(PAR/Ik)`, saturating at twice each species' band low; `lightRequirement` is derived, not declared (v21, v8).
- **`getSaturationIrradiance` requires a config** - breaking: an omitted argument read the shipped defaults whatever the caller had tuned.
- **A hypoxic fish excretes less nitrogen** - deamination is metabolism, so both NH₃ streams carry the same oxygen factor as the respiratory draw; feces do not.
- **An under-aerated tank stands nitrite** - nitrification joins the oxygen-limited processes and pays 4.57 mg O₂ per mg N; NOB are the fussier guild, so the second step stalls before the first.
- **An aerobic process runs on the oxygen there is** - decay, plants and fish scale their rate by `O2/(K+O2)`, so demand falls with the stock and a suffocating tank stops emitting carbon it never paid for (v20, v7).
- **Gases move a mass, and carbon pays for the oxygen** - plants, fish, decay and the CO₂ line all meter against the water in the tank, at the molar ratio (v19, v6).
- **A 1000 W heater no longer destroys the tank** - the picker offered a wattage the save schema refused, and a refused save discards the tank.
- **`trace` rejects unknown fields** - a mistyped `--fields` name emitted a column of blanks that reads as absent data; the refusal names the valid set, and algae is on it.
- **`config set` takes a finite number or nothing** - `Infinity` and `1e309` were stored as strings that arithmetic turned back into `NaN`, and a typo'd path grew the config a key nothing reads.
- **A tunable is held to the range it declares** - `config set`, the debug panel and the save schema all read the leaf's own min/max, so a negative attenuation can no longer make the tank's light infinite.
- **Light is PAR, not watts** - a fixture is rated at the surface, the tank runs on what reaches the substrate, and depth comes from capacity (v18, v5).
- **Age decides whether a fish can spawn** - the gate asks `age ≥ maturityAge`; a stocked adult arrives grown, one seeded at `age: 0` waits it out.
- **A tank runs the same life twice** - a seed and counter on the state: one `rngSeed`, one life, ids too. Breaking: no `generateFishId` (v17, v4).
- **The CLI rejects unknown flags** - `sim new --capacity=200` no longer builds the default tank and reports success; each subcommand names its flags.
- **Loading a preset starts a new tank** - a fresh simulation at tick 0, not a retrofit of the running one, and the dialog names what that costs.
- **Presets open cycled** - every preset but Bare Tank opens a month into its life: a working biofilter, a part-spent bed, and the nitrate to match.
- **A tank can start at a state** - `createSimulation` takes an optional `PresetSeed`: colony, bed, chemistry, fish at age and sex, plants at a size.
- **The community tank stops killing its tetras** - flow tolerance is a turnover: one powerhead is a current in a 300 L, lethal in a nano (v16, v3).
- **"Undersized" now means the flow cap bites** - a 55 gal on a HOB is no longer told it is underfiltered; a 150 gal on a canister is.
- **The device moving the water is the one that warns** - too much current names the powerhead, or the air pump, before the filter running behind it.
- **A rescape takes the biofilm** - a bed swap costs the colony the share that lived on the old bed, so an established tank blips.
- **The biofilter reads as cycled or uncycled** - both toxins at trace on colonies still clearing a load, so a starved tank stops claiming it.
- **Colonisation reads as headroom** - share of the surface ceiling is the room a colony has left, not the headline a healthy tank sat at 1 % of.
- **Processing capacity** - a bacterium clears the same ammonia in a nano as in a stock tank, and 18 °C takes twice the days to cycle that 25 °C does.
- **Nitrogen cycle** - a fresh tank cycles in about three weeks at any volume, on organics leaching from the bed; no biofilter dies for keeping up.
- **`processEquipment` requires a config** - breaking: the old default ran on `decayDefaults` whatever the caller tuned; `DEFAULT_CONFIG` is exported.
- **`formatDosePreview` removed from the public API** - breaking: string formatting living in the engine; the Flora section derives the preview now.
- **Action previews include dissolved gases** - water changes now show what they do to O₂ and CO₂, not just temperature and pH.
- **Actions sheet** - one transient surface for all six husbandry verbs, previewing each by applying the action and diffing the engine's own readings.
- **Scenario section** - five preset cards stating the tank each builds, the environment fields with their consequences, and the confirmations back.
- **Preset drift is derived** - the "modified" pill compares the tank against its preset's config, so an undo clears it and a reload cannot lose it.
- **Analytics section** - four full-width charts over a full-width log; the scrubbed tick lives in `?tick=`, so a cursor is a link for the session.
- **Error boundary keeps your tank** - render errors show a recovery screen instead of wiping the save and reloading; reset is now an explicit button.
- **Livestock section** - the roster as a table: species rows open into individuals, individuals into their own vitality breakdown, fry into batches.
- **Flora & Scape section** - per-stressor vitality breakdowns beside the algae, trim targets flagged, nutrients read against what the plants need.
- **Equipment section** - device list and inspector side by side, selection addressed as `/equipment/:deviceId`, plus a 24 h schedule band.
- **Water section** - six vertical gauges with engine-derived bands and 24 h traces, a dissolved-gases pair, and Bacteria and Waste cards.
- **Dashboard UI redesign** - index+stage shell replaces Build/Run/Review: six routed sections, a live-figure index rail, browser back between views.
- **Vitality reserve buffer** - fish `surplus` becomes a saturating bank (cap 50) that drains before condition falls; 100 can read "burning" (v13).
- **Fish reproduction** - adult pairs spend banked surplus to spawn; livebearers drop fry, egg-layers lay clutches; fry grow and mature into adults.
- **npm packaging** - publish-ready as `aquarium-simulator` v0.1.0: the build ships only the pure-TS engine, MIT license, trusted publishing.
- **Algae as pure population** - Task 42 follow-up (#48): drop `condition` from `AlgaeState`; net rate drives mass directly.

## 2026-05-02

- **Algae as a living organism** - Task 42 (#48): algae promoted from `Resources.algae` to a peer organism on `state.algae` with vitality, surplus-driven growth, and plant-suppression feedback. Persistence v11 → v12.

## 2026-05-01

- **Satiation bands** - Task 41 (#47): five-zone satiation model (Overfed / Well fed / Peckish / Hungry / Starving) replaces the two-zone hunger model. Persistence v10 → v11.

## 2026-04-27

- **Game UI extracted** - Moved `/game` (Task 23) to a separate non-open-source repo; engine, calibration CLI, and `src/ui/` untouched.
- **Remove pre-CLI calibration scaffolding** - Deleted `src/simulation/calibration/`; the stateful `sim` CLI is now the canonical path.

## 2026-04-25

- **Plants-as-fish-benefit + FishCard Conditions** - Fish vitality gains a fourth benefit (plants saturate at ~3 healthy mature plants, peak 0.2 %/h); FishCard mirrors PlantCard's `▶ Conditions (N)` block.

## 2026-04-24

- **Vitality model** - Task 40 (#45): unified damage/benefit/condition engine for plants and fish; surplus-overflow growth gating; per-species hardiness. Plants in adequate-but-not-perfect conditions now heal fully rather than parking at intermediate condition; fasting fish decline ~17× faster. Persistence v5 → v6.
- **Plant biomass cap** - Task 38: `PlantSpeciesData` gains per-species `maxSize`; growth applies an asymptotic throttle approaching the cap.
- **Per-plant trim** - `TrimPlantsAction` accepts an optional `plantId` for targeted trimming; Plants panel adds an inline slider per card.
- **Fish health legibility** - Livestock panel: trend arrow + expandable `▶ Stressors (N)` block on each fish card.

## 2026-04-23

- **Per-fish hardiness stochasticity** - Task 35: `Fish.hardinessOffset` (±15 %) sampled at `addFish` so weaker individuals fail first. Persistence v4 → v5.

## 2026-04-19

- **Low-volume stressors calibration (S04)** - Three 19 L variants; `temperatureStressSeverity` retuned 2.0 → 0.85; new `scripts/calibrate-low-volume.ts`.
- **Planted-equilibrium calibration (S02)** - Photosynthesis refactored to per-plant Liebig sufficiency by demand tier; CO2→pH logarithmic; ambient waste tightened. Hits S02 day-28 anchors.
- **NOB/AOB stoichiometric asymmetry** - NOB nitrite-processing rate scales by molar-mass ratio so NO2 throughput matches AOB output in N-atom terms.
- **Uncycled quarantine calibration** - Ammonia toxicity honors free-NH3 fraction (Emerson 1975); new `basalAmmoniaRate`; nitrification colonizes over weeks.
- **Filterless surface diffusion** - Gas exchange gains a baseline diffusion floor (`minFlowFactor`); filterless tanks no longer collapse to zero exchange.
- **Gas exchange calibration** - Fish respiration rate is an absolute mg O2/g/hr value, not a concentration delta; default 0.3.

## 2026-04-18

- **Fish gill ammonia excretion** - Fish metabolism splits ingested food N (~80 % NH3 through gills, ~20 % feces); opaque `wasteRatio` replaced with the N-mass split.
- **Nitrogen-chain stoichiometry** - NH3 → NO2 → NO3 conserves N-mass with molecular-weight scaling (1 mg NH3 → 2.70 mg NO2 → 3.64 mg NO3).
- **Fish default hunger** - `addFish` initialises hunger to 30 (was 0) so new fish eat on the next feeding instead of letting food decay.
- **CLI waterChange arbitrary fractions** - `sim action waterChange` accepts any fraction in (0–1] or percent in (0–100].
- **Calibration CLI** - Stateful `sim` CLI for agent-driven calibration; session persisted in `.simstate/current.json`; docs in `docs/calibration/`.

## 2026-02-10

- **Simulation Calibration** - Real-world calibration across 9 system groups (nitrogen cycle, gas exchange, temperature, evaporation, nutrients, plants, pH, livestock, decay).

## 2026-02-06

- **Fish Metabolism System** - Individual fish (5 species) with metabolism, hunger, health stressors, and species hardiness; Livestock panel with controls.

## 2026-02-04

- **Game UI Foundation** - New game-like UI at `/game`; Pixi.js tank canvas; responsive layout; tabbed panels with Framer Motion.

## 2026-02-01

- **Nutrients and Dosing** - Nutrient resources (PO4, K, Fe); plant condition system with shedding/death; dose action and auto doser equipment.
- **State Persistence** - Centralized localStorage persistence with Zod schema validation; session restoration; `?reset` recovery query.

## 2026-01-30

- **Aeration System** - Air pump equipment with auto-scaling; direct O2 injection from bubble dissolution; sponge filter inherently aerated.

## 2026-01-26

- **Plants System** - Individual plant specimens (5 species) with photosynthesis, respiration, biomass distribution, overgrowth penalties, and trim action.

## 2026-01-25

- **Tunable Constants** - Debug panel for runtime calibration of 38 simulation constants with localStorage persistence.

## 2026-01-21

- **Decay Mass Loss** - Aerobic decay produces CO2, consumes O2; only 40 % becomes waste; smaller tanks more sensitive.

## 2026-01-17

- **pH System** - pH drifts toward equilibrium based on hardscape (calcite raises, driftwood lowers) and CO2; H+ blending for water changes and ATO.

## 2026-01-16

- **CO2 Generator Equipment** - Configurable bubble rate (0.5–5.0 bps); schedule-based operation; integrates with gas exchange.
- **Gas Exchange System** - Dissolved O2/CO2 equilibrate toward temperature-dependent saturation and atmospheric levels; rate scales with flow.

## 2026-01-15

- **Water Change Action** - Removes proportional nitrogen mass; blends temperature toward tap water; ATO blends temperature when adding water.

## 2026-01-14

- **Nitrogen Cycle System** - Three-stage biological conversion (waste → ammonia → nitrite → nitrate) via AOB/NOB; logistic growth limited by surface area.
- **Algae Growth and Scrub System** - Algae grows based on light intensity per liter; Scrub action removes 10–30 %; high-algae alert at 80+.
- **Light Equipment and Schedule Module** - Light fixture with photoperiod scheduling; reusable Schedule module for time-based equipment.

## 2026-01-13

- **Hardscape Equipment** - Rocks, driftwood, decorations with bacteria surface area; slot system (2 per gallon, max 8).
- **Food, Decay, and Waste System** - Food and waste resources with temperature-scaled decay (Q10 = 2); Feed action.
- **Surface, Flow, and Filtration Equipment** - Tank, Filter, Powerhead, Substrate with passive resources (surface area, water flow).
- **Lid and ATO Equipment** - Lid (none / mesh / full / sealed) reduces evaporation; ATO auto-maintains water level at 100 %.
- **Actions System** - User action infrastructure with Top Off action and Actions panel UI.
- **Logging System** - Event logging with alerts, user action logs, and Log panel UI.

## 2026-01-12

- **UI Foundation** (#5) - React + Vite + Tailwind UI with timeline controls, equipment bar, and simulation integration.
- **Temperature, Evaporation, Heater** - Environment/equipment state, temperature drift, evaporation, heater control.
- **Foundation** - Simulation state, effect system, tick loop with Immer immutability.

# Changelog

All notable changes to this project will be documented in this file.

<!--
Format: - **Feature name** (#PR) - Brief description (under 100 chars)
- Group by date, newest first
- Skip UI-only tweaks and minor fixes
-->

## 2026-04-24

- **Fish health legibility** - Livestock panel: each fish card now shows a trend indicator (↑/↓ net %/hr health change, hidden when `|net| < 0.05`) next to the status badge, plus an expandable `▶ Stressors (N)` section listing every active stressor's %/hr contribution, a recovery line, and a net row; removed the now-redundant "Health critical!" warning (the status badge already conveys severity). Backed by a new `calculateStressBreakdown` that returns per-stressor damage (already scaled by hardiness) + `total`; `calculateStress` becomes a thin wrapper so UI and `processHealth` can never drift

## 2026-04-23

- **Per-fish hardiness stochasticity** - Task 35: `Fish` gains `hardinessOffset` (±15 % of species baseline, sampled once at `addFish` time, never re-rolled) so weaker individuals fail first when conditions degrade; `calculateStress` uses `effectiveHardiness = clamp(speciesHardiness + offset, 0.1, 0.95)`; `addFish` also applies ±5 % initial health jitter (clamped to [0, 100]) to capture mild purchase-condition variation; persistence schema bumped v4 → v5 (old saves discarded via existing version-mismatch path); calibration helper `addFish` neutralises jitter so scenario anchors and N-mass conservation tests stay pinned — stochasticity only flows through the live game path

## 2026-04-19

- **Low-volume stressors calibration (scenario 04)** - Three 19 L variants on the same hardware: filterless betta (Variant A, 8-week hold), betta cold-failure (A.1, heater off at tick 168), overcrowded 10-neon die-off (B); `temperatureStressSeverity` retuned 2.0 → 0.85 %/°C/hr — prior value killed a betta at 20 °C in 24 hr (scenario calls for 7–14 day decline); new `scripts/calibrate-low-volume.ts` runner with `--variant=A|A1|B`, default `seedBacteria` per variant (A/A1 pre-cycled, B uncycled) — scenario's "minimum-viable betta setup" assumes seeded bacteria; Variant A pins NH3/NO2 at 0 across 56 days, NO3 sawtooths 12 → 17 ppm pre-WC / 8 → 12 post-WC, betta health 100 throughout; Variant A.1 thermal drift 26 → 20 °C in ~18 hr (scenario 24 hr) with clean endpoint, betta declines 100 → 94 → 68 → 42 → 15 → dead over 14 days (scenario band 40–65 at day 14); Variant B NH3 amplified ~2× vs S1 at same bioload (0.67 ppm day-2 vs S1's 0.35), all 10 tetras dead by day 7 (scenario target ≤ day 8); `ambientWaste = 0.001 g/hr` survives 19 L test (~30 % of N budget at lean feed, dominated by betta output as intended)
- **Planted-equilibrium calibration (scenario 02)** - Photosynthesis refactored to per-plant Liebig sufficiency and biomass-scaled nutrient uptake (all 4 macros now flow through one pathway); `calculateNutrientSufficiency` distinguishes *required* vs *booster* nutrients by species demand tier (low needs only N; medium needs N+P; high needs all four), matching spec §Nutrient Demand Levels; `updatePlantCondition` is now homeostatic — condition tracks a linear-in-sufficiency target instead of whipsawing between discrete zones; CO2→pH coupling is Henderson-Hasselbalch-style logarithmic (coef 0.75 lands 6.4 pH at 25 ppm CO2, 6.8 at 5 ppm — scenario anchor); `basePgDriftRate` 0.08 → 0.25 so overnight pH actually reaches its target; `sizePerBiomass` 0.15 → 0.4 and new `nutrientsPerPhotosynthesis` (4.0 mg/unit) calibrate growth + uptake against 1 ml/day EI auto-doser; `ambientWaste` 0.01 → 0.001 g/hr (prior rate mineralized 52 mg NO3/day — dominated the N budget in long-running scenarios); Variant A hits all day-28 anchors (NO3 < 25, algae < 8, pH swing 0.4, plants 60-90% size, conditions ≥ 88), Variant B hits day-28 species targets (MC 33 in 30-55, AS 58 in 55-75, JF 100 > 75)
- **NOB/AOB stoichiometric asymmetry** - NOB's per-bacterium nitrite-processing rate now scales by `NOB_PROCESSING_RATE_MULTIPLIER = MW_NO2 / MW_NH3 ≈ 2.702` so NO2 throughput matches AOB's compound-mass output in N-atom terms; prior symmetric treatment let NO2 run away to 30+ ppm (NOB could only clear 37% of the NO2 mass AOB produced); seeded-cap tanks now hold NO2 < 0.15 ppm under continuous NH3 dosing; biologically backed (Nitrobacter/Nitrospira really are faster per cell than Nitrosomonas/Nitrosospira)
- **Uncycled quarantine calibration** - ammonia toxicity now honours the unionized NH3 fraction (Emerson 1975 pKa formula) so pH and temp drive gill damage instead of raw TAN ppm; new `basalAmmoniaRate` captures the continuous N excretion from body protein turnover (fasted fish no longer go silent); `ammoniaStressSeverity` reinterpreted as per-ppm-free-NH3 and retuned to 175; `nitriteStressSeverity` dropped 20→2.5 to land 96-hr LC50 near real-world 4–5 ppm; nitrogen-cycle spawn thresholds raised to 0.5 ppm and growth rates halved so bacteria colonise over weeks, not days; reproduces scenario 01's day 6–8 die-off in a 38 L uncycled tank
- **Filterless surface diffusion** - gas exchange now includes a baseline passive-diffusion floor on `flowFactor` (new `minFlowFactor`, default 0.1) so filterless tanks still equilibrate with the atmosphere across the still surface instead of collapsing to zero exchange; filterless 5 gal betta holds ~7.6 mg/L O2 during respiration draw instead of drifting indefinitely; S3 community unchanged (canister's flow factor is well above the floor)
- **Gas exchange calibration** - fish respiration `baseRespirationRate` now an absolute mg O2/g/hr rate (was mis-applied as a concentration delta, silently embedding tank volume); livestock pipeline converts to mg/L using water volume, matching the decay system's idiom; default bumped from 0.02 to 0.3, midpoint of real 0.2–0.5 band; 70 g bioload in 150 L now draws the expected 0.14 mg/L/hr and the S3 community tank holds 7–8 mg/L O2 indefinitely instead of crashing in 7 hours

## 2026-04-18

- **Fish gill ammonia excretion** - fish metabolism now splits ingested food N: ~80% emitted as direct NH3 through gills (`resources.ammonia`), ~20% feces-bound into the waste stream; new `foodNitrogenFraction` (default 0.05) and `gillNFraction` (default 0.8) tunables on `LivestockConfig`; removes the opaque `wasteRatio` knob — fish waste mass is now derived from the N-mass split; N-mass conservation enforced end-to-end
- **Nitrogen-chain stoichiometry** - NH3 → NO2 → NO3 now conserves N-mass with compound-mass scaling by molecular weight (1 mg NH3 → 2.70 mg NO2 → 3.64 mg NO3); replaces the previous physically-wrong 1:1 compound-mass conversion; `wasteToAmmoniaRatio` restored to stoichiometric 60 mg NH3/g waste
- **Fish default hunger** - `addFish` now initialises hunger to 30 (0–100 scale) instead of 0 so new fish eat on the next feeding rather than letting the food decay
- **CLI waterChange arbitrary fractions** - Removed discrete-step snap in `sim action waterChange`; accepts any fraction (0–1] or percent (0–100]; widened engine `WaterChangeAmount` type from literal union to `number` (UI preset list preserved as `WATER_CHANGE_AMOUNTS`)
- **Calibration CLI** - Stateful `sim` CLI at `src/cli/sim.ts` for agent-driven calibration; session persisted in `.simstate/current.json`; commands for new/add/remove/tick/observe/trace/config/action/smoke; capped per-tick history (720 entries); end-to-end smoke scenario doubles as integration test; workflow docs in `docs/calibration/README.md`

## 2026-02-10

- **Simulation Calibration** - real-world calibration across 9 system groups (nitrogen cycle, gas exchange, temperature, evaporation, nutrients, plants, pH, livestock, decay); calibrated O2 saturation to Henry's Law, nitrogen cycle to 25-35 day fishless cycle, algae growth to weeks-not-days blooms, CO2 injection for planted tank equilibrium, hunger rate for 3-7 day survival, pH drift for ~1 pH unit drop at 30 ppm CO2; test helpers module for scenario setup

## 2026-02-06

- **Fish Metabolism System** - Individual fish with 5 species (Neon Tetra, Betta, Guppy, Angelfish, Corydoras); metabolism consumes food/O2, produces waste/CO2; hunger increases over time, reduced by feeding; health affected by stressors (temperature, pH, ammonia, nitrite, nitrate, hunger, oxygen, water level); species hardiness modifies stress tolerance; death from health=0 or old age; Livestock panel with health/hunger bars, species selector, add/remove controls

## 2026-02-04

- **Game UI Foundation** - New game-like UI at `/game`; Pixi.js tank canvas with water gradient; responsive layout (1024px breakpoint); tabbed panels with Framer Motion animations; design system with CSS tokens; 38 component tests

## 2026-02-01

- **Nutrients and Dosing** - Nutrient resources (PO4, K, Fe); plant condition system with shedding/death; dose action and auto doser equipment

- **State Persistence** - Centralized localStorage persistence with Zod schema validation; session restoration on reload; `?reset` query parameter for recovery; confirmation dialogs for preset changes and simulation reset (tick > 720)

## 2026-01-30

- **Aeration System** - Air pump equipment with auto-scaling to tank size; direct O2 injection from bubble dissolution; boosted gas exchange rate when active; increased CO2 off-gassing (conflicts with CO2 injection for planted tanks); sponge filter inherently aerated; Air Pump card in Equipment panel with flow boost display

## 2026-01-26

- **Plants System** - Individual plant specimens with 5 species (varied light/CO2 requirements); photosynthesis produces O2, consumes CO2/nitrate when lights on; respiration runs 24/7; biomass distribution by growth rate; overgrowth penalties and waste release at >200%; algae competition; trim action; Plants panel with add/remove/size display

## 2026-01-25

- **Tunable Constants** - Debug panel for runtime calibration of 38 simulation constants; localStorage persistence; collapsible sections with visual indicators for modified values; reset per-section or global

## 2026-01-21

- **Decay Mass Loss** - Aerobic decay now produces CO2, consumes O2; only 40% becomes waste; smaller tanks more sensitive

## 2026-01-17

- **pH System** - pH resource drifts toward equilibrium based on hardscape (calcite raises, driftwood lowers) and CO2 (carbonic acid effect); H+ concentration-based blending for water changes and ATO; WaterChemistry panel displays current pH; tap water pH setting in Actions panel

## 2026-01-16

- **CO2 Generator Equipment** - Injects CO2 at configurable bubble rate (0.5-5.0 bps); schedule-based operation; displays expected mg/L/hr rate; integrates with gas exchange system
- **Gas Exchange System** - Dissolved O2/CO2 equilibrate toward temperature-dependent saturation and atmospheric levels; exchange rate scales with flow; water change and ATO blend dissolved gases; low oxygen and high CO2 alerts; WaterChemistry panel displays dissolved gases with color-coded indicators

## 2026-01-15

- **Water Change Action** - Removes proportional nitrogen mass, blends temperature toward tap water; ATO now blends temperature when adding water; WaterChangeCard UI with amount selector and tap temp control

## 2026-01-14

- **Nitrogen Cycle System** - Three-stage biological conversion: waste→ammonia→nitrite→nitrate via AOB/NOB bacteria; logistic bacterial growth limited by surface area; spawning, growth, death dynamics; alerts for high ammonia/nitrite/nitrate; WaterChemistry panel with nitrogen cycle display
- **Algae Growth and Scrub System** - Algae grows based on light intensity per liter (2.5 * W/L per hour); Scrub action removes 10-30% of algae (min 5 to scrub); High algae alert at 80+; Plants panel with algae indicator; LightCard wattage presets expanded (5W-200W)
- **Light Equipment and Schedule Module** - Light fixture with photoperiod scheduling; reusable Schedule module for time-based equipment; LightCard UI with wattage selector and schedule controls

## 2026-01-13

- **Hardscape Equipment** - Rocks, driftwood, and decorations with bacteria surface area; slot system (2 per gallon, max 8); HardscapeCard UI for add/remove
- **Food, Decay, and Waste System** - Food and waste resources with temperature-scaled decay (Q10=2); Feed action with UI; food indicator in Livestock panel; waste display in WaterChemistry panel
- **Surface, Flow, and Filtration Equipment** - Tank, Filter, Powerhead, and Substrate equipment with passive resources (surface area, water flow) calculated each tick; UI cards and ResourcesPanel for equipment control
- **Lid and ATO Equipment** - Lid with type selector (none/mesh/full/sealed) reduces evaporation; ATO auto-maintains water level at 100%
- **Actions System** - User action infrastructure with Top Off action and Actions panel UI
- **Logging System** - Event logging with alerts, user action logs, and Log panel UI display

## 2026-01-12

- **UI Foundation** (#5) - React + Vite + Tailwind UI with timeline controls, equipment bar, and simulation integration
- **Temperature, Evaporation, Heater** - Environment/equipment state, temperature drift, evaporation, heater control
- **Foundation** - Simulation state, effect system, tick loop with Immer immutability

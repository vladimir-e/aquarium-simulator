# Changelog

All notable changes to this project will be documented in this file.

<!--
Format: - **Feature name** (#PR) - Brief description (under 100 chars)
- Group by date, newest first
- Skip UI-only tweaks and minor fixes
-->

## 2026-02-01

- **Nutrients and Dosing System** - Individual nutrient resources (phosphate, potassium, iron); plant condition system (0-100%) based on nutrient sufficiency using Liebig's Law; plant shedding and death when starving; phosphate production from decay; manual dose action and auto doser equipment with schedule-based dosing; Nutrients panel with ppm display and status indicators; plant condition display in Plants panel

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

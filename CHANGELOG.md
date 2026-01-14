# Changelog

All notable changes to this project will be documented in this file.

<!--
Format: - **Feature name** (#PR) - Brief description (under 100 chars)
- Group by date, newest first
- Skip UI-only tweaks and minor fixes
-->

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

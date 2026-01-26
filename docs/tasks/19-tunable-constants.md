# Task 19: Tunable Constants Debug Panel

**Status:** completed

## Overview

Create a runtime configuration system that allows all simulation constants to be adjusted via a debug panel in the UI. This enables real-time calibration of physics and biology parameters while the simulation runs.

## References

- `docs/4-CORE-SYSTEMS.md` - System descriptions
- `src/simulation/systems/*.ts` - Current constant definitions
- `src/simulation/equipment/*.ts` - Equipment constants

## Scope

### In Scope

- Centralized tunable config system with typed defaults
- Runtime-mutable constants for all core systems
- Debug panel UI with grouped controls
- Reset to defaults functionality
- Persistence of tweaked values (localStorage)

### Out of Scope

- Saving/loading named config presets
- Sharing configs between users
- Constants for equipment specs (filter types, substrate types) - these are categorical, not tunable
- Undo/redo for constant changes

## Implementation

### 1. Tunable Config Architecture

Create a centralized config system that replaces scattered module constants:

```
src/simulation/
├── config/
│   ├── index.ts           # TunableConfig type, defaults, registry
│   ├── decay.ts           # Decay system tunables
│   ├── nitrogen-cycle.ts  # Nitrogen cycle tunables
│   ├── gas-exchange.ts    # Gas exchange tunables
│   ├── temperature.ts     # Temperature drift tunables
│   ├── evaporation.ts     # Evaporation tunables
│   ├── algae.ts           # Algae growth tunables
│   └── ph.ts              # pH drift tunables
```

Each config module exports:
- Type definition for that system's tunables
- Default values object
- Metadata (labels, min/max ranges, units) for UI

### 2. Config Registry Pattern

```typescript
// src/simulation/config/index.ts
interface TunableConfig {
  decay: DecayConfig
  nitrogenCycle: NitrogenCycleConfig
  gasExchange: GasExchangeConfig
  temperature: TemperatureConfig
  evaporation: EvaporationConfig
  algae: AlgaeConfig
  ph: PhConfig
}

const DEFAULT_CONFIG: TunableConfig = {
  decay: decayDefaults,
  nitrogenCycle: nitrogenCycleDefaults,
  // ...
}
```

### 3. Config Context

Create a React context to provide config throughout the app:

```typescript
// src/ui/context/ConfigContext.tsx
const ConfigContext = createContext<{
  config: TunableConfig
  updateConfig: (path: string, value: number) => void
  resetConfig: () => void
  resetSection: (section: keyof TunableConfig) => void
}>()
```

- Load from localStorage on mount
- Save to localStorage on changes
- Provide to simulation via hook

### 4. System Integration

Modify systems to read from config instead of module constants:

**Before:**
```typescript
// decay.ts
const Q10 = 2.0
const BASE_DECAY_RATE = 0.05

export function update(state: SimulationState): Effect[] {
  const rate = BASE_DECAY_RATE * Math.pow(Q10, ...)
}
```

**After:**
```typescript
// decay.ts
export function update(state: SimulationState, config: DecayConfig): Effect[] {
  const rate = config.baseDecayRate * Math.pow(config.q10, ...)
}
```

The system registry passes config to each system's update function.

### 5. Debug Panel UI

Create `src/ui/components/panels/DebugPanel.tsx`:

- Collapsible panel (hidden by default, toggle in Timeline)
- Sections for each system (Decay, Nitrogen Cycle, etc.)
- Each section shows tunables as labeled number inputs
- Section-level and global reset buttons
- Visual indicator when values differ from defaults

Panel layout:
```
┌─ Debug: Simulation Constants ─────────────────┐
│ [Reset All]                                    │
│                                                │
│ ▼ Decay                           [Reset]      │
│   Q10 Temperature Coefficient     [2.0    ]    │
│   Base Decay Rate (%/hr)          [5.0    ]    │
│   Waste Conversion Ratio          [0.4    ]    │
│   CO2 per Gram Decay (mg)         [250    ]    │
│                                                │
│ ▶ Nitrogen Cycle                  [Reset]      │
│ ▶ Gas Exchange                    [Reset]      │
│ ▶ Temperature                     [Reset]      │
│ ▶ Evaporation                     [Reset]      │
│ ▶ Algae                           [Reset]      │
│ ▶ pH                              [Reset]      │
└────────────────────────────────────────────────┘
```

### 6. Toggle Control

Add debug panel toggle to Timeline component:
- Gear/wrench icon button
- Shows panel as overlay or in dedicated column
- State persisted in localStorage

## Constants to Include

### Decay System
- `q10` - Temperature coefficient (default: 2.0)
- `referenceTemp` - Calibration temperature °C (default: 25)
- `baseDecayRate` - Fraction per hour (default: 0.05)
- `wasteConversionRatio` - Mass to waste (default: 0.4)
- `gasExchangePerGramDecay` - mg CO2/O2 per gram (default: 250)

### Nitrogen Cycle
- `wasteConversionRate` - Waste→ammonia per tick (default: 0.3)
- `wasteToAmmoniaRatio` - g waste to mg ammonia (default: 1.0)
- `bacteriaProcessingRate` - ppm per bacteria (default: 0.000002)
- `aobSpawnThreshold` - ppm ammonia to spawn (default: 0.02)
- `nobSpawnThreshold` - ppm nitrite to spawn (default: 0.125)
- `spawnAmount` - Initial bacteria count (default: 10)
- `aobGrowthRate` - Per tick (default: 0.03)
- `nobGrowthRate` - Per tick (default: 0.05)
- `bacteriaPerCm2` - Max density (default: 0.01)
- `bacteriaDeathRate` - Starving death rate (default: 0.02)
- `aobFoodThreshold` - Sustenance threshold (default: 0.001)
- `nobFoodThreshold` - Sustenance threshold (default: 0.001)

### Gas Exchange
- `atmosphericCo2` - Ambient CO2 mg/L (default: 4.0)
- `o2SaturationBase` - mg/L at reference temp (default: 8.5)
- `o2SaturationSlope` - Change per °C (default: -0.05)
- `o2ReferenceTemp` - Reference temp °C (default: 15)
- `baseExchangeRate` - Fraction per tick (default: 0.25)
- `optimalFlowTurnover` - Turnovers for max rate (default: 10)

### Temperature Drift
- `coolingCoefficient` - °C/hr per °C diff (default: 0.132)
- `referenceVolume` - Liters baseline (default: 100)
- `volumeExponent` - Surface/volume scaling (default: 0.333)

### Evaporation
- `baseRatePerDay` - Daily % at equilibrium (default: 0.01)
- `tempDoublingInterval` - °C for rate doubling (default: 5.56)

### Algae
- `maxGrowthRate` - Asymptotic max/hr (default: 4)
- `halfSaturation` - W/L for 50% growth (default: 1.3)
- `algaeCap` - Maximum level (default: 100)

### pH Drift
- `calciteTargetPh` - Rock pH target (default: 8.0)
- `driftwoodTargetPh` - Wood pH target (default: 6.0)
- `neutralPh` - No hardscape baseline (default: 7.0)
- `basePgDriftRate` - Fraction per tick (default: 0.05)
- `co2PhCoefficient` - pH per mg/L CO2 (default: -0.02)
- `co2NeutralLevel` - No pH effect level (default: 4.0)
- `hardscapeDiminishingFactor` - Multiple item scaling (default: 0.7)

## Acceptance Criteria

- [x] All ~35 system constants are tunables via debug panel
- [x] Changes apply immediately to running simulation
- [x] Values persist across page reloads (localStorage)
- [x] Reset buttons work (per-section and global)
- [x] Modified values are visually distinguished from defaults
- [x] Panel can be toggled on/off
- [x] No performance impact when panel is closed
- [x] TypeScript types are strict (no `any`)

## Tests

- Config context provides defaults correctly
- updateConfig updates specific values
- resetConfig restores all defaults
- resetSection restores section defaults
- localStorage persistence round-trips correctly
- Systems receive config and use values correctly

## Notes

- Consider debouncing localStorage writes
- Input validation: prevent negative values where inappropriate
- Metadata (min/max/step) enables slider controls if desired

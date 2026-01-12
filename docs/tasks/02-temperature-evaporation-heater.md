# Task 02: Temperature, Evaporation, and Heater

**Status:** pending

## Overview

Add the first real systems to the simulation: temperature drift toward room temp, water evaporation, and a heater to counteract cooling. This establishes the system/equipment architecture pattern for all future components.

## References

- [2-ENVIRONMENT.md](../2-ENVIRONMENT.md) - Room temperature specs
- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Heater equipment specs
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Temperature and evaporation system specs

## Scope

### In Scope
- Environment on state (roomTemperature)
- Equipment on state (single heater)
- System interface and registry pattern
- Temperature drift system (passive)
- Evaporation system (passive)
- Heater equipment (immediate)

### Out of Scope
- Chiller (inverse of heater - add later)
- Lid (affects evaporation rate - add later)
- Other equipment types
- Concentration effects from evaporation (needs dilution system)

## Architecture

### State Extensions

```typescript
interface Environment {
  /** Room/ambient temperature in °C */
  roomTemperature: number;
}

interface Heater {
  enabled: boolean;           // Installed/mounted to tank
  isOn: boolean;              // Currently heating (system-controlled each tick)
  targetTemperature: number;  // °C
  wattage: number;            // watts (affects heating rate)
}

interface SimulationState {
  tick: number;
  tank: Tank;
  resources: Resources;
  environment: Environment;
  equipment: {
    heater: Heater;           // Always present, `enabled` property controls if active
  };
}

// Defaults
const DEFAULT_HEATER: Heater = {
  enabled: false,
  isOn: false,
  targetTemperature: 25,
  wattage: 100,
};
```

### System Interface

```typescript
interface System {
  /** Unique identifier */
  id: string;
  /** Which tier this system runs in */
  tier: EffectTier;
  /** Generate effects based on current state */
  update(state: SimulationState): Effect[];
}
```

### Equipment Interface

Equipment follows the same pattern as systems - they produce effects:

```typescript
interface Equipment {
  id: string;
  tier: EffectTier;  // Usually 'immediate'
  update(state: SimulationState): Effect[];
}
```

## Implementation

### 1. State Updates (`src/simulation/state.ts`)

- Add `Environment` interface
- Add `Heater` interface
- Extend `SimulationState` with `environment` and `equipment`
- Update `SimulationConfig` to accept initial environment and equipment
- Default room temperature: 22°C

### 2. System Types (`src/simulation/systems/types.ts`)

```typescript
export interface System {
  id: string;
  tier: EffectTier;
  update(state: SimulationState): Effect[];
}
```

### 3. Temperature Drift (`src/simulation/systems/temperature-drift.ts`)

Physics: Newton's Law of Cooling - heat loss proportional to temperature differential.

**Formula:**
```typescript
const COOLING_COEFFICIENT = 0.132;  // °C/hr per °C differential at reference volume
const REFERENCE_VOLUME = 100;       // liters (baseline for volumeScale = 1.0)
const VOLUME_EXPONENT = 1/3;       // Surface-area-to-volume scaling (A ∝ V^(2/3))

const deltaT = waterTemp - roomTemp;
const volumeScale = Math.pow(REFERENCE_VOLUME / waterVolume, VOLUME_EXPONENT);
const coolingRate = COOLING_COEFFICIENT * Math.abs(deltaT) * volumeScale;
const drift = -Math.sign(deltaT) * Math.min(Math.abs(deltaT), coolingRate);
```

**Calibration:** 1.3 W/L achieves ~5.5°C rise above room temp at equilibrium.

**Volume scaling:** Smaller tanks change temperature faster (more surface area relative to volume). A 50L tank has volumeScale=1.26, a 200L tank has volumeScale=0.79.

### 4. Evaporation (`src/simulation/systems/evaporation.ts`)

Physics: Evaporation rate scales exponentially with temperature differential.

**Formula:**
```typescript
const BASE_RATE_PER_DAY = 0.01;        // 1% per day at equilibrium (no lid, medium flow)
const TEMP_DOUBLING_INTERVAL = 5.56;   // °C (every 5.56°C diff doubles evaporation)

const tempDelta = Math.abs(waterTemp - roomTemp);
const tempMultiplier = Math.pow(2, tempDelta / TEMP_DOUBLING_INTERVAL);
const dailyRate = BASE_RATE_PER_DAY * tempMultiplier;
const hourlyRate = dailyRate / 24;
const evapAmount = waterLevel * hourlyRate;
```

**Calibration:** ~1% water loss per day at temperature equilibrium.

**Future extensions (out of scope):**
- Lid multiplier: mesh (0.5), full (0.25), sealed (0.0)
- Agitation multiplier based on flow rate (0.67 at 0 GPH to 2.5 max)

### 5. Heater (`src/simulation/equipment/heater.ts`)

Logic:
- If disabled (`enabled: false`), do nothing
- If water temp >= target temp, set `isOn: false`, emit no effects
- If water temp < target temp, set `isOn: true`, emit heating effect

**Formula:**
```typescript
const REFERENCE_VOLUME = 100;    // liters (must match temperature drift)
const VOLUME_EXPONENT = 1/3;    // Must match temperature drift for equilibrium

const volumeScale = Math.pow(REFERENCE_VOLUME / waterVolume, VOLUME_EXPONENT);
const heatingRate = (wattage / waterVolume) * volumeScale;
const delta = Math.min(heatingRate, targetTemp - currentTemp);  // Don't overshoot
```

**Calibration:** 1.3 W/L achieves ~5.5°C rise above room temp at equilibrium.

**Note:** The heater formula and temperature drift formula are interdependent - they share constants to ensure realistic equilibrium behavior. An underpowered heater will plateau below target (realistic).

### 6. System Registry (`src/simulation/systems/index.ts`)

```typescript
export const coreSystems: System[] = [
  temperatureDriftSystem,
  evaporationSystem,
];
```

### 7. Equipment Registry (`src/simulation/equipment/index.ts`)

```typescript
export function getEquipmentEffects(state: SimulationState): Effect[] {
  const effects: Effect[] = [];

  effects.push(...heaterUpdate(state));
  // Future: effects.push(...filterUpdate(state));
  // Future: effects.push(...lightUpdate(state));

  return effects;
}
```

### 8. Tick Integration (`src/simulation/tick.ts`)

Update `collectEffects` to:
1. Collect equipment effects (immediate tier)
2. Collect core system effects (passive tier)

## File Structure

```
src/simulation/
  state.ts              # Extended with environment, equipment
  effects.ts            # Add new resource keys if needed
  tick.ts               # Integrate system/equipment registries
  systems/
    types.ts            # System interface
    temperature-drift.ts
    evaporation.ts
    index.ts            # Core systems registry
  equipment/
    types.ts            # Equipment interfaces (Heater, etc.)
    heater.ts
    index.ts            # Equipment effect collector
```

## Acceptance Criteria

- [ ] Environment with roomTemperature is on state
- [ ] Equipment with heater (always present) is on state
- [ ] Temperature drifts toward room temp over time
- [ ] Water level decreases due to evaporation
- [ ] Heater maintains target temperature when enabled
- [ ] Heater sets `isOn: true` when heating, `isOn: false` otherwise
- [ ] Heater does nothing when disabled (`enabled: false`)
- [ ] Systems are modular and independently testable
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// temperature-drift.test.ts
- drifts toward room temp when water is warmer
- drifts toward room temp when water is cooler
- drift rate scales with temperature difference
- drift rate scales inversely with tank volume
- no drift when at room temperature

// evaporation.test.ts
- reduces water level over time
- evaporation rate increases with temperature
- evaporation rate scales with tank size
- no negative water level

// heater.test.ts
- heats water when below target and sets isOn: true
- stops heating at target temperature and sets isOn: false
- does nothing when disabled (enabled: false), isOn stays false
- heating rate depends on wattage
- heating rate scales inversely with volume

// integration
- heater counteracts temperature drift
- simulation reaches equilibrium with heater on
```

## Notes

- Shared constants between heater and temperature drift: `REFERENCE_VOLUME = 100L`, `VOLUME_EXPONENT = 1/3`
- Calibration: 1.3 W/L achieves 5.5°C rise above room temp at equilibrium
- REFERENCE_VOLUME controls rate of change, not equilibrium point
- Evaporation concentration effects deferred (needs dilution system)
- Effect `source` uses system/equipment name (e.g., "heater", "temperature-drift")

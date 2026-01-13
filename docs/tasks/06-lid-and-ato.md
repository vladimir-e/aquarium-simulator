# Task 06: Lid and Auto Top-Off (ATO)

**Status:** pending

## Overview

Add Lid and Auto Top-Off (ATO) equipment to control evaporation and automatically maintain water level. Lid reduces evaporation based on type, and ATO automatically restores water to 100% when level drops below 99%.

## References

- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Lid and ATO equipment specs
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Evaporation system

## Scope

### In Scope
- Lid equipment (always present, type selectable)
- ATO equipment (always present, disabled by default)
- Update evaporation system to apply lid multiplier
- ATO triggers at 99% and restores to 100% in single tick
- UI cards for both equipment types in EquipmentBar
- Logging for lid type changes

### Out of Scope
- Dilution effects when ATO adds water (deferred to dilution system task)
- pH changes from tap water (deferred to dilution system task)
- ATO fill rate limiting (restores instantly in one tick)
- Lid affects on gas exchange (deferred to gas exchange system task)

## Architecture

### State Extensions

```typescript
export interface Lid {
  /** Lid type affects evaporation rate */
  type: 'none' | 'mesh' | 'full' | 'sealed';
}

export interface AutoTopOff {
  /** Whether ATO is enabled */
  enabled: boolean;
}

export interface Equipment {
  heater: Heater;
  lid: Lid;
  ato: AutoTopOff;
}

// Defaults
export const DEFAULT_LID: Lid = {
  type: 'none',
};

export const DEFAULT_ATO: AutoTopOff = {
  enabled: false,
};
```

### Evaporation Multipliers

Based on lid type, evaporation is multiplied:

| Lid Type | Multiplier | Description |
|----------|------------|-------------|
| none | 1.0 | Full evaporation (100%) |
| mesh | 0.75 | Reduced evaporation (75%) |
| full | 0.25 | Minimal evaporation (25%) |
| sealed | 0.0 | No evaporation (0%) |

### ATO Behavior

ATO monitors water level and tops off when needed:

```typescript
const WATER_LEVEL_THRESHOLD = 0.99; // 99% of capacity

if (ato.enabled && waterLevel < capacity * WATER_LEVEL_THRESHOLD) {
  const waterNeeded = capacity - waterLevel;
  // Effect: +water (waterNeeded liters)
  // Restores to exactly 100% in single tick
}
```

**Note:** ATO adds pure water (no dilution effects yet). Dilution system will handle chemistry changes in a future task.

## Implementation

### 1. State Updates (`src/simulation/state.ts`)

- Add `Lid` interface
- Add `AutoTopOff` interface
- Extend `Equipment` interface with `lid` and `ato`
- Add `DEFAULT_LID` and `DEFAULT_ATO` constants
- Update `SimulationConfig` to accept optional `lid` and `ato` configuration
- Update `createSimulation` to initialize lid and ato

### 2. Update Evaporation System (`src/simulation/systems/evaporation.ts`)

Modify evaporation calculation to apply lid multiplier:

```typescript
function getLidMultiplier(lidType: Lid['type']): number {
  switch (lidType) {
    case 'none': return 1.0;
    case 'mesh': return 0.75;
    case 'full': return 0.25;
    case 'sealed': return 0.0;
  }
}

export function evaporationSystem(state: SimulationState): Effect[] {
  // ... existing calculation ...

  const lidMultiplier = getLidMultiplier(state.equipment.lid.type);
  const evapAmount = baseEvapAmount * lidMultiplier;

  // ... emit effect ...
}
```

### 3. ATO Equipment (`src/simulation/equipment/ato.ts`)

```typescript
import type { SimulationState } from '../state.js';
import type { Effect } from '../effects.js';

const WATER_LEVEL_THRESHOLD = 0.99;

export function atoUpdate(state: SimulationState): Effect[] {
  const { ato } = state.equipment;
  const { waterLevel, capacity } = state.tank;

  if (!ato.enabled) {
    return [];
  }

  const thresholdLevel = capacity * WATER_LEVEL_THRESHOLD;

  if (waterLevel < thresholdLevel) {
    const waterNeeded = capacity - waterLevel;

    return [
      {
        tier: 'immediate',
        resource: 'water',
        delta: waterNeeded,
        source: 'ato',
      },
    ];
  }

  return [];
}
```

### 4. Equipment Registry (`src/simulation/equipment/index.ts`)

Add ATO to equipment effects collection:

```typescript
import { atoUpdate } from './ato.js';

export function getEquipmentEffects(state: SimulationState): Effect[] {
  const effects: Effect[] = [];

  effects.push(...heaterUpdate(state));
  effects.push(...atoUpdate(state));

  return effects;
}
```

### 5. Logging for Lid Changes

When user changes lid type, log the change:

```typescript
// In UI or state mutation handler
const log = createLog(
  state.tick,
  'equipment',
  'info',
  `Lid changed to ${newType}`
);
```

**Note:** ATO should NOT log when topping off (would be too spammy at high speeds).

### 6. UI Components

#### LidCard (`src/ui/components/equipment/LidCard.tsx`)

```typescript
export interface LidState {
  type: 'none' | 'mesh' | 'full' | 'sealed';
}

interface LidCardProps {
  lid: LidState;
  onTypeChange: (type: LidState['type']) => void;
}

// Card with:
// - Lid icon/emoji
// - Type selector dropdown
// - Description of current type's effect
```

#### AutoTopOffCard (`src/ui/components/equipment/AutoTopOffCard.tsx`)

```typescript
export interface AutoTopOffState {
  enabled: boolean;
}

interface AutoTopOffCardProps {
  ato: AutoTopOffState;
  onEnabledChange: (enabled: boolean) => void;
}

// Card with:
// - ATO icon/emoji
// - Enabled toggle switch
// - Status indicator (enabled/disabled)
```

#### Update EquipmentBar (`src/ui/components/layout/EquipmentBar.tsx`)

```typescript
interface EquipmentBarProps {
  heater: HeaterState;
  lid: LidState;
  ato: AutoTopOffState;
  onHeaterEnabledChange: (enabled: boolean) => void;
  onHeaterTargetTemperatureChange: (temp: number) => void;
  onHeaterWattageChange: (wattage: number) => void;
  onLidTypeChange: (type: LidState['type']) => void;
  onAtoEnabledChange: (enabled: boolean) => void;
}

// Add LidCard and AutoTopOffCard to equipment grid
// Update collapsed view to show lid and ato status
```

## File Structure

```
src/simulation/
  state.ts                      # Add Lid, AutoTopOff interfaces
  systems/
    evaporation.ts              # Add lid multiplier logic
  equipment/
    ato.ts                      # New: ATO logic
    index.ts                    # Add ATO to equipment effects

src/ui/components/
  equipment/
    LidCard.tsx                 # New: Lid UI component
    AutoTopOffCard.tsx          # New: ATO UI component
  layout/
    EquipmentBar.tsx            # Add lid and ato cards
```

## Acceptance Criteria

- [ ] Lid equipment with type selector is on state (default: 'none')
- [ ] ATO equipment with enabled toggle is on state (default: false)
- [ ] Evaporation respects lid multiplier (none: 100%, mesh: 75%, full: 25%, sealed: 0%)
- [ ] ATO triggers when water level < 99% and restores to 100%
- [ ] ATO only works when enabled
- [ ] Lid type changes are logged
- [ ] ATO does NOT log topping off events
- [ ] UI has LidCard with type dropdown
- [ ] UI has AutoTopOffCard with enabled toggle
- [ ] EquipmentBar displays both new equipment cards
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// evaporation.test.ts (updated)
- applies no reduction with lid type 'none'
- applies 75% reduction with lid type 'mesh'
- applies 25% of evaporation with lid type 'full'
- applies 0% evaporation (no evaporation) with lid type 'sealed'

// ato.test.ts
- does nothing when disabled
- does nothing when water level >= 99%
- adds water to restore 100% when level < 99% and enabled
- restores to exactly tank capacity (100%)
- emits immediate tier effect
- does not log when topping off

// integration
- sealed lid + no ATO = water level decreases
- sealed lid prevents all evaporation
- ATO automatically maintains water level at 100%
- mesh lid + ATO = less frequent ATO activation
```

## Notes

- ATO adds pure water only (no dilution effects until dilution system is implemented)
- Lid does not affect gas exchange yet (deferred to gas exchange system)
- ATO has no fill rate limit - restores instantly in one tick (realistic for small evaporation amounts)
- Logging policy: Lid changes logged (infrequent user actions), ATO topping off not logged (would spam at high speeds)
- Future: Jump protection from lid (needs livestock system)

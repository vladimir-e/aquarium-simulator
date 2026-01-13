# Task 07: Surface, Flow, and Filtration Equipment

**Status:** pending

## Overview

Implement Surface and Flow passive resources along with Tank, Filter, Powerhead, and Substrate equipment. These provide the foundation for bacterial colonization (nitrogen cycle) and gas exchange systems.

## References

- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Tank, Filter, Powerhead, Substrate specs
- [5-RESOURCES.md](../5-RESOURCES.md) - Surface and Flow resource definitions
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Nitrogen cycle and gas exchange (future)

## Scope

### In Scope
- **Passive Resources**: Surface (cm²), Flow (L/h)
- **Tank Equipment**: Volume, bacteria surface area
- **Filter Equipment**: Type (Sponge, HOB, Canister, Sump), enabled toggle, flow rate, bacteria surface area
- **Powerhead Equipment**: Enabled toggle with flow strength options (Low, Medium, High)
- **Substrate Equipment**: Type (None, Sand, Gravel, Aqua Soil), bacteria surface area
- **Passive Resource Calculation**: Aggregate surface and flow from all equipment
- **UI Components**: Cards for Tank, Filter, Powerhead, Substrate in EquipmentBar
- **UI Mini Indicators**: Substrate indicator in collapsed equipment bar (similar to lid)
- **Equipment State Initialization**: Default configurations for all equipment

### Out of Scope
- Nitrogen cycle implementation (deferred - surface needed by bacteria)
- Gas exchange implementation (deferred - flow affects exchange rate)
- Substrate nutrient release (Aqua Soil releases nutrients - deferred to plant system)
- Substrate vacuuming action (deferred to actions)
- Filter cleaning action (deferred to actions)
- Hardscape equipment (provides surface + pH effects - separate task)

## Architecture

### State Extensions

```typescript
// Passive resources
export interface PassiveResources {
  /** Total bacteria surface area from all equipment (cm²) */
  surface: number;
  /** Total water flow from all equipment (L/h) */
  flow: number;
}

// Tank already has capacity, add surface area
export interface Tank {
  /** Tank water capacity (liters) */
  capacity: number;
  /** Current water level (liters) */
  waterLevel: number;
  /** Bacteria surface area from glass walls (cm²) */
  bacteriaSurface: number;
}

export interface Filter {
  /** Whether filter is running */
  enabled: boolean;
  /** Filter type determines flow and surface area */
  type: 'sponge' | 'hob' | 'canister' | 'sump';
}

export interface Powerhead {
  /** Whether powerhead is running */
  enabled: boolean;
  /** Flow rate preset in GPH (gallons per hour) */
  flowRateGPH: 240 | 400 | 600 | 850;
}

export interface Substrate {
  /** Substrate type affects surface area and plant rooting */
  type: 'none' | 'sand' | 'gravel' | 'aqua_soil';
}

export interface Equipment {
  heater: Heater;
  lid: Lid;
  ato: AutoTopOff;
  filter: Filter;
  powerhead: Powerhead;
  substrate: Substrate;
}

export interface SimulationState {
  // ... existing fields ...
  tank: Tank;
  equipment: Equipment;
  passiveResources: PassiveResources;
}
```

### Equipment Specifications

Based on [3-EQUIPMENT.md](../3-EQUIPMENT.md):

#### Tank
```typescript
// Surface area for bacteria colonization
// Calculated from volume assuming standard rectangular shape
function calculateTankSurface(capacity: number): number {
  // Approximation: 4 walls + bottom
  // Assuming standard proportions (length:width:height ≈ 2:1:1)
  const volume = capacity; // liters
  const height = Math.cbrt(volume / 2); // dm
  const width = height;
  const length = 2 * height;

  const surface = 2 * (length * height) + 2 * (width * height) + (length * width);
  return surface * 100; // convert dm² to cm²
}
```

#### Filter Types
| Type | Flow Rate | Bacteria Surface | Notes |
|------|-----------|------------------|-------|
| Sponge | 100 L/h | 8,000 cm² | Simple, good for fry tanks |
| HOB | 300 L/h | 15,000 cm² | Common, easy maintenance |
| Canister | 600 L/h | 25,000 cm² | External, high capacity |
| Sump | 1000 L/h | 40,000 cm² | Separate tank, most capacity |

#### Powerhead

Flow rate presets in GPH (gallons per hour), converted internally to L/h:

| Flow Rate (GPH) | Flow Rate (L/h) | Recommended Tank Size |
|-----------------|-----------------|----------------------|
| 240 GPH | 908 L/h | 5-20 gallons |
| 400 GPH | 1,514 L/h | 20-30 gallons |
| 600 GPH | 2,271 L/h | 30-50 gallons |
| 850 GPH | 3,218 L/h | 50-80 gallons |

**Note:** GPH values chosen for clean numbers; conversion factor: 1 GPH ≈ 3.785 L/h

```typescript
const GPH_TO_LPH = 3.785;

function convertGPHtoLPH(gph: number): number {
  return Math.round(gph * GPH_TO_LPH);
}

// Flow rates stored and calculated in L/h internally
const POWERHEAD_FLOW_LPH = {
  240: 908,   // 240 GPH
  400: 1514,  // 400 GPH
  600: 2271,  // 600 GPH
  850: 3218,  // 850 GPH
};
```

#### Substrate Types
| Type | Bacteria Surface (per liter of tank) | Notes |
|------|--------------------------------------|-------|
| None | 0 cm²/L | No substrate |
| Sand | 400 cm²/L | Fine particles, can't vacuum |
| Gravel | 800 cm²/L | Medium particles, can vacuum |
| Aqua Soil | 1,200 cm²/L | Porous, nutrient-rich |

Calculate substrate surface:
```typescript
function getSubstrateSurface(type: Substrate['type'], tankCapacity: number): number {
  const surfacePerLiter = {
    none: 0,
    sand: 400,
    gravel: 800,
    aqua_soil: 1200,
  };

  return surfacePerLiter[type] * tankCapacity;
}
```

### Passive Resource Calculation

Passive resources are calculated each tick by aggregating from all equipment:

```typescript
export function calculatePassiveResources(state: SimulationState): PassiveResources {
  const { tank, equipment } = state;

  // Surface area
  let surface = 0;
  surface += tank.bacteriaSurface; // glass walls
  if (equipment.filter.enabled) {
    surface += getFilterSurface(equipment.filter.type);
  }
  surface += getSubstrateSurface(equipment.substrate.type, tank.capacity);

  // Flow rate
  let flow = 0;
  if (equipment.filter.enabled) {
    flow += getFilterFlow(equipment.filter.type);
  }
  if (equipment.powerhead.enabled) {
    flow += getPowerheadFlow(equipment.powerhead.flowRateGPH);
  }

  return { surface, flow };
}

function getFilterSurface(type: Filter['type']): number {
  const surfaces = {
    sponge: 8000,
    hob: 15000,
    canister: 25000,
    sump: 40000,
  };
  return surfaces[type];
}

function getFilterFlow(type: Filter['type']): number {
  const flows = {
    sponge: 100,
    hob: 300,
    canister: 600,
    sump: 1000,
  };
  return flows[type];
}

function getPowerheadFlow(flowRateGPH: Powerhead['flowRateGPH']): number {
  // Returns flow in L/h
  const flows = {
    240: 908,
    400: 1514,
    600: 2271,
    850: 3218,
  };
  return flows[flowRateGPH];
}
```

### Integration with Tick

```typescript
// In tick.ts, before collecting effects
export function runTick(state: SimulationState): SimulationState {
  return produce(state, draft => {
    draft.tick++;

    // Calculate passive resources first (used by other systems)
    draft.passiveResources = calculatePassiveResources(draft);

    // Then collect and apply effects in tiers
    // ... rest of tick logic
  });
}
```

## Implementation

### 1. State Updates (`src/simulation/state.ts`)

- Add `PassiveResources` interface
- Add `Filter`, `Powerhead`, `Substrate` interfaces
- Update `Tank` interface to include `bacteriaSurface`
- Extend `Equipment` interface with new equipment
- Add defaults:
  ```typescript
  export const DEFAULT_FILTER: Filter = {
    enabled: true,
    type: 'sponge'
  };
  export const DEFAULT_POWERHEAD: Powerhead = {
    enabled: false,
    flowRateGPH: 400
  };
  export const DEFAULT_SUBSTRATE: Substrate = {
    type: 'none'
  };
  ```
- Update `createSimulation` to:
  - Calculate tank bacteria surface from capacity
  - Initialize filter, powerhead, substrate
  - Calculate initial passive resources

### 2. Passive Resource Calculation (`src/simulation/passive-resources.ts`)

New file:
```typescript
import type { SimulationState } from './state.js';
import type { PassiveResources, Filter, Substrate, Powerhead } from './state.js';

export function calculatePassiveResources(state: SimulationState): PassiveResources {
  // Implementation as described above
}

function calculateTankSurface(capacity: number): number {
  // Implementation as described above
}

function getFilterSurface(type: Filter['type']): number {
  // Implementation as described above
}

function getFilterFlow(type: Filter['type']): number {
  // Implementation as described above
}

function getSubstrateSurface(type: Substrate['type'], tankCapacity: number): number {
  // Implementation as described above
}

function getPowerheadFlow(flowRateGPH: Powerhead['flowRateGPH']): number {
  // Implementation as described above
  // Converts GPH to L/h
}
```

### 3. Tick Integration (`src/simulation/tick.ts`)

Update `runTick` to calculate passive resources before applying effects:

```typescript
import { calculatePassiveResources } from './passive-resources.js';

export function runTick(state: SimulationState): SimulationState {
  return produce(state, draft => {
    draft.tick++;

    // Calculate passive resources (used by systems)
    draft.passiveResources = calculatePassiveResources(draft);

    // Rest of tick logic...
  });
}
```

### 4. UI Components

#### TankCard (`src/ui/components/equipment/TankCard.tsx`)

```typescript
interface TankCardProps {
  capacity: number;
  waterLevel: number;
  bacteriaSurface: number;
}

// Card displays:
// - Tank icon
// - Capacity (read-only, set at initialization)
// - Current water level with percentage
// - Bacteria surface area (informational)
```

#### FilterCard (`src/ui/components/equipment/FilterCard.tsx`)

```typescript
interface FilterCardProps {
  filter: FilterState;
  onEnabledChange: (enabled: boolean) => void;
  onTypeChange: (type: FilterState['type']) => void;
}

// Card displays:
// - Filter icon with status indicator (running/off)
// - Enabled toggle
// - Type dropdown (Sponge, HOB, Canister, Sump)
// - Stats: Flow rate and bacteria surface for selected type
// - Warning if disabled (no filtration, bacteria will die)
```

#### PowerheadCard (`src/ui/components/equipment/PowerheadCard.tsx`)

```typescript
interface PowerheadCardProps {
  powerhead: PowerheadState;
  onEnabledChange: (enabled: boolean) => void;
  onFlowRateChange: (flowRateGPH: PowerheadState['flowRateGPH']) => void;
}

// Card displays:
// - Powerhead icon with status indicator (running/off)
// - Enabled toggle
// - Flow rate dropdown (240 GPH, 400 GPH, 600 GPH, 850 GPH)
// - Show both GPH and converted L/h for selected rate
// - Recommended tank size helper text
```

#### SubstrateCard (`src/ui/components/equipment/SubstrateCard.tsx`)

```typescript
interface SubstrateCardProps {
  substrate: SubstrateState;
  tankCapacity: number;
  onTypeChange: (type: SubstrateState['type']) => void;
}

// Card displays:
// - Substrate icon
// - Type dropdown (None, Sand, Gravel, Aqua Soil)
// - Bacteria surface area for selected type
// - Notes (e.g., "Sand cannot be vacuumed", "Aqua Soil releases nutrients")
```

#### ResourcesPanel (`src/ui/components/resources/ResourcesPanel.tsx`)

New panel to display passive resources:

```typescript
interface ResourcesPanelProps {
  passiveResources: PassiveResources;
}

// Panel displays:
// - Surface: X,XXX cm² (formatted with commas)
// - Flow: XXX L/h (X.X turnovers/hour based on tank size)
```

#### Update EquipmentBar (`src/ui/components/layout/EquipmentBar.tsx`)

Add new equipment cards to the grid:
- TankCard
- FilterCard (with enabled toggle)
- PowerheadCard (with enabled toggle and flow rate selector in GPH)
- SubstrateCard

**Collapsed/Mini View:**

Similar to the lid indicator (from Task 06), add substrate indicator when substrate type is not 'none':

```typescript
// In collapsed equipment bar
{substrate.type !== 'none' && (
  <div className="substrate-indicator">
    {getSubstrateIcon(substrate.type)}
    <span>{formatSubstrateName(substrate.type)}</span>
  </div>
)}
```

Substrate indicators:
- Sand: 🏖️ or ⏺️ (fine particles)
- Gravel: 🪨 (medium particles)
- Aqua Soil: 🌱 (nutrient-rich soil)

### 5. Equipment State Management

Update `useSimulation` hook to handle new equipment state changes:

```typescript
const handleFilterEnabledChange = (enabled: boolean) => {
  setSimulation(prev => produce(prev, draft => {
    draft.equipment.filter.enabled = enabled;
    draft.logs.push(createLog(
      draft.tick,
      'equipment',
      'info',
      `Filter ${enabled ? 'enabled' : 'disabled'}`
    ));
  }));
};

const handleFilterTypeChange = (type: FilterState['type']) => {
  setSimulation(prev => produce(prev, draft => {
    draft.equipment.filter.type = type;
    draft.logs.push(createLog(
      draft.tick,
      'equipment',
      'info',
      `Filter changed to ${type}`
    ));
  }));
};

const handlePowerheadEnabledChange = (enabled: boolean) => {
  setSimulation(prev => produce(prev, draft => {
    draft.equipment.powerhead.enabled = enabled;
    draft.logs.push(createLog(
      draft.tick,
      'equipment',
      'info',
      `Powerhead ${enabled ? 'enabled' : 'disabled'}`
    ));
  }));
};

const handlePowerheadFlowRateChange = (flowRateGPH: PowerheadState['flowRateGPH']) => {
  setSimulation(prev => produce(prev, draft => {
    draft.equipment.powerhead.flowRateGPH = flowRateGPH;
    draft.logs.push(createLog(
      draft.tick,
      'equipment',
      'info',
      `Powerhead flow rate set to ${flowRateGPH} GPH`
    ));
  }));
};

const handleSubstrateTypeChange = (type: SubstrateState['type']) => {
  setSimulation(prev => produce(prev, draft => {
    draft.equipment.substrate.type = type;
    draft.logs.push(createLog(
      draft.tick,
      'equipment',
      'info',
      `Substrate changed to ${type}`
    ));
  }));
};
```

## File Structure

```
src/simulation/
  state.ts                          # Add interfaces, defaults
  passive-resources.ts              # New: Calculate surface & flow
  passive-resources.test.ts         # New: Tests
  tick.ts                           # Update to calculate passive resources

src/ui/components/
  equipment/
    TankCard.tsx                    # New: Tank display
    FilterCard.tsx                  # New: Filter UI
    PowerheadCard.tsx               # New: Powerhead UI
    SubstrateCard.tsx               # New: Substrate UI
  resources/
    ResourcesPanel.tsx              # New: Display passive resources
  layout/
    EquipmentBar.tsx                # Add new equipment cards
```

## Acceptance Criteria

- [ ] Surface and Flow passive resources on state (cm², L/h)
- [ ] Tank has bacteria surface area calculated from capacity
- [ ] Filter with enabled toggle and type selector (Sponge, HOB, Canister, Sump) on state (default: enabled, sponge)
- [ ] Powerhead with enabled toggle and flow rate selector (240/400/600/850 GPH) on state (default: disabled, 400 GPH)
- [ ] Substrate with type selector (None, Sand, Gravel, Aqua Soil) on state (default: none)
- [ ] `calculatePassiveResources()` aggregates surface from tank + filter (if enabled) + substrate
- [ ] `calculatePassiveResources()` aggregates flow from filter (if enabled) + powerhead (if enabled)
- [ ] Disabled filter contributes 0 surface and 0 flow
- [ ] Powerhead flow rates in GPH converted to L/h internally (908/1514/2271/3218 L/h)
- [ ] Passive resources calculated each tick before effects
- [ ] UI has TankCard showing capacity, water level, surface
- [ ] UI has FilterCard with enabled toggle, type dropdown, and stats
- [ ] UI has PowerheadCard with enabled toggle, flow rate dropdown (GPH), and displays both GPH and L/h
- [ ] UI has SubstrateCard with type dropdown and surface info
- [ ] UI has ResourcesPanel showing total surface and flow
- [ ] Collapsed equipment bar shows substrate indicator when type is not 'none' (similar to lid)
- [ ] Equipment changes are logged (enable/disable, type changes, flow rate changes)
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// passive-resources.test.ts
describe('calculatePassiveResources', () => {
  describe('surface calculation', () => {
    - includes tank bacteria surface
    - includes filter surface based on type when enabled
    - disabled filter contributes 0 surface
    - includes substrate surface based on type and tank capacity
    - totals all sources correctly
    - substrate 'none' contributes 0 surface
    - aqua soil provides most surface (1200 cm²/L)
  });

  describe('flow calculation', () => {
    - includes filter flow based on type when enabled
    - disabled filter contributes 0 flow
    - includes powerhead flow when enabled based on GPH setting
    - powerhead disabled contributes 0 flow
    - powerhead 240 GPH provides 908 L/h
    - powerhead 400 GPH provides 1514 L/h
    - powerhead 600 GPH provides 2271 L/h
    - powerhead 850 GPH provides 3218 L/h
    - sponge filter provides lowest flow (100 L/h)
    - sump filter provides highest flow (1000 L/h)
    - totals filter + powerhead correctly
    - GPH values converted to L/h correctly
  });
});

// state.test.ts (updated)
- initializes tank with bacteria surface calculated from capacity
- initializes filter enabled with default type 'sponge'
- initializes powerhead disabled with default flow rate 400 GPH
- initializes substrate with default type 'none'
- initial passive resources calculated correctly

// tick.test.ts (updated)
- recalculates passive resources each tick
- passive resources update when equipment changes
- passive resources update when filter enabled state changes
- passive resources update when powerhead flow rate changes
```

## Notes

- **Passive resources are NOT accumulated** - they are recalculated each tick from current equipment
- Tank bacteria surface is calculated once at initialization (tank size doesn't change)
- Substrate surface scales with tank capacity (larger tanks = more substrate = more surface)
- Future systems (nitrogen cycle, gas exchange) will consume these passive resources
- Filter flow rates are approximations based on typical equipment specs
- **Powerhead flow rates in GPH** - Clean numbers (240/400/600/850) based on common powerhead products
- **GPH converted to L/h internally** - All calculations use L/h for consistency (1 GPH ≈ 3.785 L/h)
- Powerhead is optional - many setups work fine with just filter flow
- **Filter can be disabled** - useful for maintenance or troubleshooting, but bacteria will die without flow/filtration
- **Powerhead presets allow realistic scaling** - users can choose appropriate flow rate for their tank size
- This task provides infrastructure; actual usage comes in nitrogen cycle and gas exchange tasks
- Equipment changes are logged (infrequent user actions)
- **UI substrate indicator** - Shows in collapsed equipment bar when substrate is present (similar to lid indicator pattern)

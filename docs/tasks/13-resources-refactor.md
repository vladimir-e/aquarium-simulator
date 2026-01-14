# Task 13: Resources Refactor - Unified Resource Model

**Status:** pending

**Note:** This refactor should be completed BEFORE Task 12 (Nitrogen Cycle). It establishes the foundation for adding 5 new nitrogen cycle resources cleanly.

## Overview

Refactor resources into a unified model where all resources live in `state.resources`. Currently resources are scattered across `state.resources`, `state.tank.waterLevel`, and `state.passiveResources`. The design doc (`docs/5-RESOURCES.md`) treats ALL of these as resources - code should match design.

This refactor also introduces resource metadata abstraction with centralized formatting, units, bounds, and display precision.

## References

- [5-RESOURCES.md](../5-RESOURCES.md) - Resource catalog with all resource definitions
- [1-DESIGN.md](../1-DESIGN.md) - Effect system architecture
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Systems that operate on resources

## Scope

### In Scope

**Unified Resource Structure:**
- Move `tank.waterLevel` → `resources.water`
- Move `passiveResources.surface` → `resources.surface`
- Move `passiveResources.flow` → `resources.flow`
- Move `passiveResources.light` → `resources.light`
- Keep existing: `resources.temperature`, `resources.food`, `resources.waste`, `resources.algae`
- Result: All 8 resources in `state.resources`

**Resource Abstraction:**
- Create `src/simulation/resources/` module
- Individual resource files with metadata (units, bounds, precision, formatting)
- `ResourceRegistry` for type-safe access
- Remove hardcoded bounds from effects system

**System Updates:**
- Effects system: Use resource bounds from registry (explicit switch case)
- Equipment: Update passive resource calculations to write to resources
- Systems: Update water references (waterLevel → water)
- Actions: Update water references
- UI: Use resource formatters instead of scattered `toFixed()`

### Out of Scope

- `tank.capacity` - Configuration property, stays in tank
- `tank.hardscapeSlots` - Configuration property, stays in tank
- Tank structure refactoring beyond removing waterLevel and bacteriaSurface
- Resource categorization in code structure (passive/active/physical are conceptual only)

## Implementation

### 1. Create Resource Module

**Create `src/simulation/resources/types.ts`:**

```typescript
export interface ResourceDefinition<TKey extends string = string> {
  key: TKey;
  unit: string;
  bounds: { min: number; max: number };
  defaultValue: number;
  precision: number;
  format: (value: number) => string;
  safeRange?: { min: number; max: number };
  stressRange?: { min: number; max: number };
}
```

**Create individual resource files:**
- `temperature.ts` - °C, bounds 0-50, precision 1
- `water.ts` - L, bounds 0-Infinity, precision 1
- `surface.ts` - cm², bounds 0-Infinity, precision 0
- `flow.ts` - L/h, bounds 0-Infinity, precision 0
- `light.ts` - W, bounds 0-Infinity, precision 0
- `food.ts` - g, bounds 0-1000, precision 2
- `waste.ts` - g, bounds 0-1000, precision 2
- `algae.ts` - unitless (0-100 scale), bounds 0-100, precision 0

**Create `index.ts`:**
- Export all resource definitions
- Create `ResourceRegistry` object with all resources indexed by key
- Export `ResourceKey` type (union of all keys)

### 2. Update State Structure

**Update `src/simulation/state.ts`:**

```typescript
export interface Resources {
  // Physical
  water: number;        // Was tank.waterLevel
  temperature: number;  // Existing

  // Passive (calculated each tick)
  surface: number;      // Was passiveResources.surface
  flow: number;         // Was passiveResources.flow
  light: number;        // Was passiveResources.light

  // Biological
  food: number;         // Existing
  waste: number;        // Existing
  algae: number;        // Existing
}

export interface Tank {
  capacity: number;       // Keep
  hardscapeSlots: number; // Keep
  // Remove: waterLevel, bacteriaSurface
}

// Remove: PassiveResources interface
```

**Update `createSimulation()`:**
- Initialize all 8 resources in `resources` object
- Calculate initial surface from tank glass + equipment
- Remove `passiveResources` initialization
- Remove `tank.bacteriaSurface` initialization

### 3. Update Effects System

**Update `src/simulation/core/effects.ts`:**

```typescript
import { ResourceRegistry, type ResourceKey } from '../resources/index.js';

export type { ResourceKey }; // Re-export for convenience

// Update Effect interface resource field to use ResourceKey

// In applyEffects:
for (const effect of effects) {
  const resource = ResourceRegistry[effect.resource];

  switch (effect.resource) {
    case 'water':
      draft.resources.water = clamp(
        draft.resources.water + effect.delta,
        resource.bounds.min,
        draft.tank.capacity  // Dynamic max
      );
      break;
    case 'temperature':
      draft.resources.temperature = clamp(
        draft.resources.temperature + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
    case 'surface':
      draft.resources.surface = clamp(
        draft.resources.surface + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
    case 'flow':
      draft.resources.flow = clamp(
        draft.resources.flow + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
    case 'light':
      draft.resources.light = clamp(
        draft.resources.light + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
    case 'food':
      draft.resources.food = clamp(
        draft.resources.food + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
    case 'waste':
      draft.resources.waste = clamp(
        draft.resources.waste + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
    case 'algae':
      draft.resources.algae = clamp(
        draft.resources.algae + effect.delta,
        resource.bounds.min,
        resource.bounds.max
      );
      break;
  }
}
```

Remove hardcoded bounds constants (MIN_TEMPERATURE, MAX_RESOURCE, etc).

### 4. Update Equipment and Passive Resources

**Update `src/simulation/equipment/index.ts`:**

Rename `calculatePassiveResources()` to `updatePassiveResources()` and have it directly update state:

```typescript
export function updatePassiveResources(state: SimulationState): void {
  const tankGlassSurface = state.tank.bacteriaSurface; // Calculate from capacity

  state.resources.surface = tankGlassSurface +
    (state.equipment.filter.enabled ? getFilterSurface(...) : 0) +
    getSubstrateSurface(...) +
    calculateHardscapeTotalSurface(...);

  state.resources.flow =
    (state.equipment.filter.enabled ? getFilterFlow(...) : 0) +
    (state.equipment.powerhead.enabled ? getPowerheadFlow(...) : 0);

  state.resources.light = isLightOn(...)
    ? state.equipment.light.wattage
    : 0;
}
```

Or return an object with the passive resource values and update in tick.

**Calculate tank glass surface inline:**
Move `calculateTankBacteriaSurface()` logic inline where needed (in createSimulation and updatePassiveResources).

### 5. Update Systems

**Systems using waterLevel:**
- `systems/evaporation.ts` - Change `state.tank.waterLevel` → `state.resources.water`
- Effects from evaporation change resource from `waterLevel` → `water`

**Systems using light:**
- `systems/algae.ts` - Change `passiveResources.light` → `resources.light`

### 6. Update Actions

**Actions using waterLevel:**
- `actions/top-off.ts` - Change `state.tank.waterLevel` → `state.resources.water`

### 7. Update Equipment

**Equipment using waterLevel:**
- `equipment/ato.ts` - Change water references

**Equipment using surface:**
- `equipment/filter.ts`, `substrate.ts`, `hardscape.ts` - Already provide surface values, no changes needed

### 8. Update Alerts

- `alerts/water-level.ts` - Change `state.tank.waterLevel` → `state.resources.water`

### 9. Update Tick Loop

**Update `src/simulation/tick.ts`:**
- Call `updatePassiveResources()` at start of tick (writes to state.resources)
- Or calculate passive resources and update state.resources before running systems

### 10. Update UI Components

**Components with toFixed():**
Replace with resource formatters:
- `Environment.tsx` - `TemperatureResource.format(waterTemperature)`
- `TankCard.tsx` - `WaterResource.format(tank.waterLevel)` → `WaterResource.format(resources.water)`
- `WaterChemistry.tsx` - `WasteResource.format(waste)`, `FoodResource.format(food)`
- `Plants.tsx` - `AlgaeResource.format(algae)`
- `Livestock.tsx` - `FoodResource.format(food)`
- `Visualization.tsx` - `WaterResource.format(waterLevel)`

**Components accessing passiveResources:**
- `ResourcesPanel.tsx` - Access from `state.resources` instead

**Components accessing tank.waterLevel:**
- Update all to use `resources.water`

### 11. Update Tests

- Update all test assertions for new structure
- Test files touching waterLevel, passiveResources, or using hardcoded bounds

## Acceptance Criteria

### State Structure
- [ ] All 8 resources in `state.resources`: water, surface, flow, light, temperature, food, waste, algae
- [ ] `state.passiveResources` interface and usage removed
- [ ] `state.tank.waterLevel` removed, replaced with `state.resources.water`
- [ ] `state.tank.bacteriaSurface` removed (merged into surface calculation)
- [ ] `state.tank` only contains: capacity, hardscapeSlots

### Resource Module
- [ ] `src/simulation/resources/` module created with 8 resource files + types + index
- [ ] Each resource has: key, unit, bounds, defaultValue, precision, format()
- [ ] ResourceRegistry provides type-safe access to all resources
- [ ] ResourceKey type is union of all resource keys

### Effects System
- [ ] applyEffects uses ResourceRegistry for bounds
- [ ] Explicit switch case for all 8 resources (no dynamic property access)
- [ ] Hardcoded bounds constants removed
- [ ] 'waterLevel' resource key renamed to 'water'

### Systems & Actions
- [ ] All references to `state.tank.waterLevel` changed to `state.resources.water`
- [ ] All references to `state.passiveResources.*` changed to `state.resources.*`
- [ ] Evaporation system emits 'water' effects (not 'waterLevel')

### UI Components
- [ ] All `toFixed()` calls replaced with resource formatters
- [ ] Components use resource.format() for display
- [ ] No hardcoded unit strings (get from resource.unit if needed)

### Tests
- [ ] All tests updated for new structure
- [ ] All 448+ tests pass
- [ ] Build succeeds
- [ ] Lint passes

## Notes

- **No categorization in code structure** - passive/active/physical are conceptual (calculation method), not structural (where they live). All resources go in `state.resources`.
- **Explicit over clever** - Use explicit switch case in effects, not dynamic property access. TypeScript catches errors, code is clearer.
- **Formatting wins** - The real value is `WaterResource.format(water)` for consistent UI display, not making effects generic.
- **Design alignment** - Code structure now matches `docs/5-RESOURCES.md` exactly.
- **bacteriaSurface grows with plants** - In future, plant growth will increase surface area. Treating surface as a resource (not tank property) makes this natural.
- **Water is a resource** - Participates in resource flows (providers: ATO/water changes, consumers: evaporation), affects concentrations (ppm = grams/liters) later.

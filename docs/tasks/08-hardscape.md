# Task 08: Hardscape Equipment

**Status:** pending

## Overview

Implement hardscape equipment (rocks, driftwood, decorations) that provide bacteria surface area and occupy tank slots. Each tank has a limited number of hardscape slots based on size (2 per gallon, max 8). This task implements all 4 hardscape types with surface area contribution but defers pH effects to a future chemistry system task.

## References

- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Hardscape specs (types, surface area, pH effects, slot system)
- [5-RESOURCES.md](../5-RESOURCES.md) - Bacteria Surface resource definition
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Future pH/Dilution system (pH effects deferred)

## Scope

### In Scope
- **Hardscape Types**: All 4 types (Neutral Rock, Calcite Rock, Driftwood, Plastic Decoration)
- **Slot System**: Calculate available slots (2 per gallon, max 8), track usage
- **Bacteria Surface**: Each hardscape item contributes surface area based on type
- **Multiple Items**: Hardscape is an array - users can add/remove items up to slot limit
- **Passive Resource Integration**: Include hardscape surface in total surface calculation
- **UI Panel**: HardscapeCard showing current items, slot usage, and add/remove controls
- **Logging**: Log when hardscape items are added/removed

### Out of Scope
- **pH Effects**: Calcite Rock (+pH), Driftwood (-pH) tracked but not implemented (deferred to Dilution/Chemistry task)
- **Stress Reduction**: "Provides hiding spots" mentioned in spec but livestock system not implemented yet
- **Visual Representation**: 3D tank view with hardscape placement (far future)
- **Hardscape Cleaning**: Algae accumulation on hardscape (deferred to algae task)

## Architecture

### State Extensions

```typescript
export type HardscapeType = 'neutral_rock' | 'calcite_rock' | 'driftwood' | 'plastic_decoration';

export interface HardscapeItem {
  /** Unique ID for this item (for add/remove operations) */
  id: string;
  /** Type determines surface area and pH effect (future) */
  type: HardscapeType;
}

export interface Hardscape {
  /** Array of hardscape items in the tank */
  items: HardscapeItem[];
}

export interface Equipment {
  // ... existing fields ...
  hardscape: Hardscape;
}

export interface Tank {
  capacity: number;
  waterLevel: number;
  bacteriaSurface: number;
  /** Maximum hardscape items allowed (2 per gallon, max 8) */
  hardscapeSlots: number;
}
```

### Hardscape Specifications

Based on [3-EQUIPMENT.md](../3-EQUIPMENT.md):

| Type | Bacteria Surface | pH Effect (Future) | Notes |
|------|------------------|---------------------|-------|
| Neutral Rock | 400 cm² | None | Inert stone |
| Calcite Rock | 400 cm² | +pH (raises) | Calcium-based rock |
| Driftwood | 650 cm² | -pH (lowers) | Releases tannins |
| Plastic Decoration | 100 cm² | None | Smooth surface |

**Slot Calculation:**
```typescript
function calculateHardscapeSlots(capacityLiters: number): number {
  const gallons = capacityLiters / 3.785;
  const slots = Math.floor(gallons * 2);
  return Math.min(slots, 8); // Cap at 8
}
```

**Surface Contribution:**
```typescript
function getHardscapeSurface(type: HardscapeType): number {
  const surfaces = {
    neutral_rock: 400,
    calcite_rock: 400,
    driftwood: 650,
    plastic_decoration: 100,
  };
  return surfaces[type];
}

function calculateHardscapeTotalSurface(items: HardscapeItem[]): number {
  return items.reduce((total, item) => {
    return total + getHardscapeSurface(item.type);
  }, 0);
}
```

### Passive Resource Integration

Update `calculatePassiveResources()` to include hardscape:

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
  surface += calculateHardscapeTotalSurface(equipment.hardscape.items); // NEW

  // Flow rate (unchanged)
  let flow = 0;
  if (equipment.filter.enabled) {
    flow += getFilterFlow(equipment.filter.type);
  }
  if (equipment.powerhead.enabled) {
    flow += getPowerheadFlow(equipment.powerhead.flowRateGPH);
  }

  return { surface, flow };
}
```

## Implementation

### 1. State Updates (`src/simulation/state.ts`)

- Add `HardscapeType` type
- Add `HardscapeItem` interface
- Add `Hardscape` interface
- Update `Tank` interface to include `hardscapeSlots`
- Extend `Equipment` interface with `hardscape`
- Add default:
  ```typescript
  export const DEFAULT_HARDSCAPE: Hardscape = {
    items: []
  };
  ```
- Update `createSimulation` to:
  - Calculate tank hardscape slots from capacity
  - Initialize hardscape with empty items array

### 2. Hardscape Helper Functions (`src/simulation/equipment/hardscape.ts`)

New file:
```typescript
import type { HardscapeType, HardscapeItem } from '../state.js';

/**
 * Get bacteria surface area for a hardscape type
 */
export function getHardscapeSurface(type: HardscapeType): number {
  const surfaces = {
    neutral_rock: 400,
    calcite_rock: 400,
    driftwood: 650,
    plastic_decoration: 100,
  };
  return surfaces[type];
}

/**
 * Calculate total bacteria surface from all hardscape items
 */
export function calculateHardscapeTotalSurface(items: HardscapeItem[]): number {
  return items.reduce((total, item) => {
    return total + getHardscapeSurface(item.type);
  }, 0);
}

/**
 * Calculate available hardscape slots based on tank capacity
 * 2 slots per gallon, max 8 slots
 */
export function calculateHardscapeSlots(capacityLiters: number): number {
  const gallons = capacityLiters / 3.785;
  const slots = Math.floor(gallons * 2);
  return Math.min(slots, 8);
}

/**
 * Get human-readable name for hardscape type
 */
export function getHardscapeName(type: HardscapeType): string {
  const names = {
    neutral_rock: 'Neutral Rock',
    calcite_rock: 'Calcite Rock',
    driftwood: 'Driftwood',
    plastic_decoration: 'Plastic Decoration',
  };
  return names[type];
}

/**
 * Get pH effect description (for future implementation)
 */
export function getHardscapePHEffect(type: HardscapeType): string | null {
  const effects = {
    neutral_rock: null,
    calcite_rock: 'Raises pH',
    driftwood: 'Lowers pH',
    plastic_decoration: null,
  };
  return effects[type];
}
```

### 3. Update Passive Resources (`src/simulation/passive-resources.ts`)

Import and use hardscape surface calculation:

```typescript
import { calculateHardscapeTotalSurface } from './equipment/hardscape.js';

export function calculatePassiveResources(state: SimulationState): PassiveResources {
  const { tank, equipment } = state;

  // Surface area
  let surface = 0;
  surface += tank.bacteriaSurface;
  if (equipment.filter.enabled) {
    surface += getFilterSurface(equipment.filter.type);
  }
  surface += getSubstrateSurface(equipment.substrate.type, tank.capacity);
  surface += calculateHardscapeTotalSurface(equipment.hardscape.items); // Add this line

  // Flow rate (unchanged)
  // ...

  return { surface, flow };
}
```

### 4. UI Component (`src/ui/components/equipment/HardscapeCard.tsx`)

```typescript
import { useState } from 'react';
import type { Hardscape, HardscapeType, HardscapeItem } from '@/simulation/state';
import { getHardscapeName, getHardscapeSurface, getHardscapePHEffect } from '@/simulation/equipment/hardscape';
import { Panel } from '../layout/Panel';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

interface HardscapeCardProps {
  hardscape: Hardscape;
  usedSlots: number;
  totalSlots: number;
  onAddItem: (type: HardscapeType) => void;
  onRemoveItem: (id: string) => void;
}

export function HardscapeCard({
  hardscape,
  usedSlots,
  totalSlots,
  onAddItem,
  onRemoveItem,
}: HardscapeCardProps) {
  const [selectedType, setSelectedType] = useState<HardscapeType>('neutral_rock');

  const hardscapeTypes: HardscapeType[] = [
    'neutral_rock',
    'calcite_rock',
    'driftwood',
    'plastic_decoration',
  ];

  const canAddMore = usedSlots < totalSlots;

  return (
    <Panel title="Hardscape" icon="🪨">
      <div className="space-y-3">
        {/* Slot usage */}
        <div className="text-sm">
          <span className="font-medium">Slots:</span> {usedSlots}/{totalSlots}
        </div>

        {/* Add hardscape */}
        <div className="space-y-2">
          <Select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as HardscapeType)}
            disabled={!canAddMore}
          >
            {hardscapeTypes.map(type => (
              <option key={type} value={type}>
                {getHardscapeName(type)}
              </option>
            ))}
          </Select>

          {/* Show stats for selected type */}
          <div className="text-xs text-gray-600">
            Surface: {getHardscapeSurface(selectedType)} cm²
            {getHardscapePHEffect(selectedType) && (
              <span className="ml-2 text-gray-500">
                ({getHardscapePHEffect(selectedType)})
              </span>
            )}
          </div>

          <Button
            onClick={() => onAddItem(selectedType)}
            disabled={!canAddMore}
            size="sm"
          >
            Add Item
          </Button>
        </div>

        {/* Current items list */}
        {hardscape.items.length > 0 && (
          <div className="border-t pt-2 space-y-1">
            {hardscape.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded"
              >
                <span>{getHardscapeName(item.type)}</span>
                <Button
                  onClick={() => onRemoveItem(item.id)}
                  size="sm"
                  variant="secondary"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {hardscape.items.length === 0 && (
          <div className="text-sm text-gray-500 italic">
            No hardscape items
          </div>
        )}
      </div>
    </Panel>
  );
}
```

### 5. Update EquipmentBar (`src/ui/components/layout/EquipmentBar.tsx`)

Add HardscapeCard to equipment grid and pass handlers:

```typescript
import { HardscapeCard } from '../equipment/HardscapeCard';

// In component:
<HardscapeCard
  hardscape={simulation.equipment.hardscape}
  usedSlots={simulation.equipment.hardscape.items.length}
  totalSlots={simulation.tank.hardscapeSlots}
  onAddItem={handleAddHardscape}
  onRemoveItem={handleRemoveHardscape}
/>
```

### 6. State Management Handlers

Add handlers to App.tsx or simulation hook:

```typescript
import { nanoid } from 'nanoid'; // or use crypto.randomUUID()

const handleAddHardscape = (type: HardscapeType) => {
  setSimulation(prev => produce(prev, draft => {
    // Check slot limit
    if (draft.equipment.hardscape.items.length >= draft.tank.hardscapeSlots) {
      return; // Can't add more
    }

    // Create new item
    const newItem: HardscapeItem = {
      id: nanoid(),
      type,
    };

    draft.equipment.hardscape.items.push(newItem);

    draft.logs.push(createLog(
      draft.tick,
      'user_action',
      'info',
      `Added ${getHardscapeName(type)} hardscape`
    ));
  }));
};

const handleRemoveHardscape = (id: string) => {
  setSimulation(prev => produce(prev, draft => {
    const item = draft.equipment.hardscape.items.find(i => i.id === id);
    if (!item) return;

    draft.equipment.hardscape.items = draft.equipment.hardscape.items.filter(
      i => i.id !== id
    );

    draft.logs.push(createLog(
      draft.tick,
      'user_action',
      'info',
      `Removed ${getHardscapeName(item.type)} hardscape`
    ));
  }));
};
```

## File Structure

```
src/simulation/
  state.ts                          # Add interfaces, types, defaults
  equipment/
    hardscape.ts                    # New: Hardscape helper functions
    hardscape.test.ts               # New: Tests
  passive-resources.ts              # Update to include hardscape surface
  passive-resources.test.ts         # Update tests

src/ui/components/
  equipment/
    HardscapeCard.tsx               # New: Hardscape management UI
  layout/
    EquipmentBar.tsx                # Add HardscapeCard
```

## Acceptance Criteria

- [ ] `HardscapeType` type with 4 values (neutral_rock, calcite_rock, driftwood, plastic_decoration)
- [ ] `HardscapeItem` interface with id and type
- [ ] `Hardscape` interface with items array
- [ ] Tank has `hardscapeSlots` calculated (2 per gallon, max 8)
- [ ] Equipment has `hardscape` with empty items array by default
- [ ] `getHardscapeSurface()` returns correct surface area for each type (400/400/650/100 cm²)
- [ ] `calculateHardscapeTotalSurface()` sums surface from all items
- [ ] `calculateHardscapeSlots()` calculates slots correctly (2 per gallon, max 8)
- [ ] `getHardscapeName()` returns human-readable names
- [ ] `getHardscapePHEffect()` returns pH effect descriptions (for future use)
- [ ] `calculatePassiveResources()` includes hardscape surface in total
- [ ] Adding hardscape increases total surface area
- [ ] Removing hardscape decreases total surface area
- [ ] Can't add more items than available slots
- [ ] Each item has unique ID for add/remove operations
- [ ] UI shows slot usage (e.g., "3/6 slots")
- [ ] UI shows all 4 hardscape types in selector
- [ ] UI shows surface area and pH effect for selected type
- [ ] UI shows list of current hardscape items with remove buttons
- [ ] UI disables add button when slots are full
- [ ] Adding/removing hardscape is logged
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// hardscape.test.ts
describe('hardscape helpers', () => {
  describe('getHardscapeSurface', () => {
    - neutral_rock returns 400 cm²
    - calcite_rock returns 400 cm²
    - driftwood returns 650 cm²
    - plastic_decoration returns 100 cm²
  });

  describe('calculateHardscapeTotalSurface', () => {
    - empty array returns 0
    - single item returns its surface area
    - multiple items sum correctly
    - mixed types calculate correctly
  });

  describe('calculateHardscapeSlots', () => {
    - 10L tank (2.6 gal) = 5 slots
    - 20L tank (5.3 gal) = 10 slots → capped at 8
    - 40L tank (10.6 gal) = 21 slots → capped at 8
    - 100L tank (26.4 gal) = 52 slots → capped at 8
  });

  describe('getHardscapeName', () => {
    - returns human-readable names for all types
  });

  describe('getHardscapePHEffect', () => {
    - neutral_rock returns null
    - calcite_rock returns 'Raises pH'
    - driftwood returns 'Lowers pH'
    - plastic_decoration returns null
  });
});

// passive-resources.test.ts (updated)
describe('calculatePassiveResources with hardscape', () => {
  - includes hardscape surface in total
  - hardscape surface adds to tank + filter + substrate
  - empty hardscape contributes 0 surface
  - multiple hardscape items sum correctly
  - different hardscape types calculate correctly
});

// state.test.ts (updated)
- initializes hardscape with empty items array
- calculates hardscape slots correctly based on tank capacity
- slots capped at 8 for large tanks

// Integration tests
describe('hardscape management', () => {
  - can add hardscape item up to slot limit
  - can't add beyond slot limit
  - can remove hardscape item
  - removing item frees up slot for new item
  - each item has unique ID
  - surface updates when hardscape added/removed
  - logs created when hardscape added/removed
});
```

## Notes

- **Hardscape is decorative and functional** - provides bacteria colonization surface
- **Slot system prevents overfilling** - realistic constraint (2 per gallon, max 8)
- **Multiple items allowed** - users can mix types (e.g., 2 rocks + 1 driftwood)
- **pH effects deferred** - tracked in helper function but not implemented yet (needs Dilution system)
- **No spatial positioning** - items don't have x/y/z coordinates (out of scope for simulation)
- **Driftwood has most surface** - 650 cm² due to porous/complex structure
- **Plastic has least surface** - 100 cm² due to smooth surface
- **Stress reduction for fish** - mentioned in spec but livestock not implemented yet
- **Future algae accumulation** - hardscape will be surface for algae growth (deferred)
- **ID generation** - use `nanoid()` or `crypto.randomUUID()` for unique IDs
- **Equipment changes are user actions** - logged with 'user_action' category
- This task completes the equipment foundation for bacteria colonization (nitrogen cycle can now use total surface)

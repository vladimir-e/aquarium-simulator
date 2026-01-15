# Task 15: Water Change Action with Temperature Blending

**Status:** completed

**Depends on:** Task 14 (Nitrogen Mass Model) - mass-based storage makes chemistry math trivial

## Overview

Implement the Water Change action - a core aquarium maintenance task that removes old water (with dissolved waste) and replaces it with fresh tap water. This affects both chemistry (dilutes nitrogen compounds) and temperature (blends toward tap water temp).

Also update ATO equipment to properly dilute concentrations when adding water (ATO is essentially a water change without the removal step).

## References

- [8-ACTIONS.md](../8-ACTIONS.md) - User actions specification
- [2-ENVIRONMENT.md](../2-ENVIRONMENT.md) - Environment parameters
- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - ATO equipment

## Scope

### In Scope

**Environment state:**
- Add `tapWaterTemperature` to environment (default: 20°C, adjustable)

**Water Change action:**
- Amount options: 10%, 25%, 50%, 90%
- Removes water volume (percentage of current water)
- Removes proportional nitrogen compound mass (ammonia, nitrite, nitrate)
- Adds fresh tap water (same volume removed)
- Blends temperature toward tap water temperature
- Instant effect (action mutates state directly)

**ATO update:**
- When ATO adds water, dilute nitrogen concentrations proportionally
- Same as water change but without the removal step (only addition)

**Temperature blending:**
- Physically correct heat capacity formula
- `newTemp = (oldTemp * remainingVolume + tapTemp * addedVolume) / totalVolume`

**UI:**
- Water Change action in Actions panel
- Amount selector (10%, 25%, 50%, 90%)
- Display tap water temperature near the action (editable stepper)

### Out of Scope

- pH blending (not implemented yet)
- Tap water nitrate content (assume pure/0 for now)
- Gravel vacuum action (separate maintenance action)
- Filter cleaning (separate)

## Implementation

### 1. Update Environment State

**Update `src/simulation/state.ts`:**

```typescript
export interface Environment {
  roomTemperature: number;
  tapWaterTemperature: number;  // New: default 20°C
}
```

**Update `createSimulation()`:**

```typescript
environment: {
  roomTemperature: 22,
  tapWaterTemperature: 20,
},
```

### 2. Create Water Change Action

**Create `src/simulation/actions/water-change.ts`:**

```typescript
import { produce } from 'immer';
import type { SimulationState } from '../state.js';

export type WaterChangeAmount = 0.1 | 0.25 | 0.5 | 0.9;

export interface WaterChangeOptions {
  amount: WaterChangeAmount;  // Fraction of water to change
}

/**
 * Perform a water change: remove old water (with dissolved compounds)
 * and replace with fresh tap water at tap temperature.
 */
export function waterChange(
  state: SimulationState,
  options: WaterChangeOptions
): SimulationState {
  const { amount } = options;

  return produce(state, (draft) => {
    const currentWater = draft.resources.water;
    const waterRemoved = currentWater * amount;
    const remainingWater = currentWater - waterRemoved;

    // 1. Remove proportional nitrogen compound mass
    // (water leaving carries dissolved compounds)
    draft.resources.ammonia *= (1 - amount);
    draft.resources.nitrite *= (1 - amount);
    draft.resources.nitrate *= (1 - amount);

    // 2. Temperature blending
    // newTemp = (oldTemp * remaining + tapTemp * added) / total
    const oldTemp = draft.resources.temperature;
    const tapTemp = draft.environment.tapWaterTemperature;
    draft.resources.temperature =
      (oldTemp * remainingWater + tapTemp * waterRemoved) / currentWater;

    // 3. Water volume unchanged (removed = added)
    // draft.resources.water stays the same

    // 4. Log the action
    draft.log.push({
      tick: draft.tick,
      type: 'action',
      message: `Water change: ${amount * 100}%`,
    });
  });
}
```

### 3. Update ATO Equipment

**Update `src/simulation/equipment/ato.ts`:**

When ATO adds water, it dilutes concentrations (same as adding tap water without removal):

```typescript
export function processAto(state: SimulationState): SimulationState {
  if (!state.equipment.ato.enabled) return state;

  const currentWater = state.resources.water;
  const capacity = state.tank.capacity;

  // ATO triggers when below 99%
  if (currentWater >= capacity * 0.99) return state;

  return produce(state, (draft) => {
    const waterToAdd = capacity - currentWater;
    const newTotalWater = capacity;

    // Dilution factor: existing mass spread across more water
    const dilutionFactor = currentWater / newTotalWater;

    // Dilute nitrogen compounds (mass unchanged, concentration decreases)
    // With mass-based storage: mass stays same, but we're adding water
    // Actually with mass model, we don't change mass - ppm auto-decreases
    // But we DO need to blend temperature

    // Temperature blending
    const oldTemp = draft.resources.temperature;
    const tapTemp = draft.environment.tapWaterTemperature;
    draft.resources.temperature =
      (oldTemp * currentWater + tapTemp * waterToAdd) / newTotalWater;

    // Restore water level
    draft.resources.water = capacity;

    draft.log.push({
      tick: draft.tick,
      type: 'equipment',
      message: `ATO: added ${waterToAdd.toFixed(1)}L`,
    });
  });
}
```

**Note:** With mass-based storage from Task 14, ATO doesn't need to modify ammonia/nitrite/nitrate mass - the ppm automatically decreases when water increases (ppm = mass / water). ATO only needs to blend temperature and restore water.

### 4. Register Water Change Action

**Update `src/simulation/actions/index.ts`:**

```typescript
export { waterChange, type WaterChangeOptions, type WaterChangeAmount } from './water-change.js';
```

### 5. UI Components

**Create `src/ui/actions/WaterChangeCard.tsx`:**

- Dropdown or button group for amount (10%, 25%, 50%, 90%)
- Temperature stepper for tap water temp (display near action)
- "Change Water" button
- Shows current water volume and what will be changed

**Update `src/ui/panels/ActionsPanel.tsx`:**

- Add WaterChangeCard to the panel

**Update environment controls (if exists) or create:**

- Tap water temperature stepper (can be in WaterChangeCard directly)

## Acceptance Criteria

### Environment State
- [ ] `environment.tapWaterTemperature` added (default 20°C)
- [ ] Tap temp adjustable via UI stepper

### Water Change Action
- [ ] Amount options: 10%, 25%, 50%, 90%
- [ ] Removes proportional nitrogen mass (ammonia, nitrite, nitrate)
- [ ] Blends temperature: `(oldTemp * remaining + tapTemp * added) / total`
- [ ] Water volume unchanged after change (removed = added)
- [ ] Action logged

### ATO Update
- [ ] ATO blends temperature when adding water
- [ ] With mass-based storage, ppm automatically dilutes (no mass change needed)
- [ ] ATO logged

### Temperature Blending
- [ ] Formula is physically correct (heat capacity weighted average)
- [ ] 50% water change with 20°C tap into 26°C tank → 23°C result
- [ ] 25% water change blends proportionally

### UI
- [ ] WaterChangeCard in Actions panel
- [ ] Amount selector works
- [ ] Tap temp stepper near water change action
- [ ] Action triggers correctly

### Tests
- [ ] Water change removes correct proportion of nitrogen mass
- [ ] Temperature blending formula correct
- [ ] ATO temperature blending works
- [ ] Integration: water change reduces ppm correctly
- [ ] All tests pass, build succeeds, lint passes

## Notes

- **Depends on Task 14** - With mass-based nitrogen storage, the math is simple: remove X% water = remove X% mass. Without Task 14, we'd need complex ppm recalculation.
- **ATO is simpler than water change** - ATO only adds water (no removal), so nitrogen mass stays constant and ppm auto-decreases. Only temperature needs blending.
- **No Dilution system needed** - The original design mentioned a Dilution core system. With mass-based storage, this is unnecessary - concentration changes are implicit in the storage model.
- **Tap water is "pure"** - For now, assume tap water has 0 ammonia/nitrite/nitrate. Future enhancement could add tap nitrate.
- **Future: pH blending** - When pH is implemented, water change will also blend pH (logarithmic blending). The action structure supports adding this later.

## Doc Updates Required

After implementing this task, update:
- `docs/2-ENVIRONMENT.md` - Add tap water temperature
- `docs/4-CORE-SYSTEMS.md` - Remove or update Dilution system reference (no longer needed)
- `docs/8-ACTIONS.md` - Add Water Change action details

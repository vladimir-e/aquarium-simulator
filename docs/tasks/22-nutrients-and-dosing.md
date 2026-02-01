# Task 22: Nutrients System and Dosing

**Status:** completed

## Overview

Expand the simplified nitrate-only plant nutrition model to track individual nutrients (Nitrate, Phosphate, Potassium, Iron) that determine plant growth rate and health. Add plant condition tracking with die-off mechanics when nutrients are insufficient. Implement manual Dosing action and Auto Doser equipment that provides a balanced all-in-one fertilizer.

The system should enable both:
- **Low-tech tanks**: Fish waste provides nitrate (+ trace phosphate), enough for low-demand plants
- **High-tech tanks**: Dosing provides complete nutrition for demanding plants to thrive

## References

- [6-PLANTS.md](../6-PLANTS.md) - Plant specification (to be updated)
- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Equipment specification (auto doser)
- [5-RESOURCES.md](../5-RESOURCES.md) - Resource definitions (add new nutrients)
- [8-ACTIONS.md](../8-ACTIONS.md) - Actions specification (dosing action)
- Task 20 - Existing plants system implementation

## Scope

### In Scope

- **Individual Nutrients as Resources**:
  - Nitrate (NO3) - already exists, from nitrogen cycle + fertilizer
  - Phosphate (PO4) - from fish waste decay + fertilizer
  - Potassium (K) - only from fertilizer (not in fish waste)
  - Iron (Fe) - only from fertilizer (representative micronutrient)
  - All stored as mass (mg), displayed as ppm

- **Fertilizer Model**:
  - All-in-one fertilizer with fixed nutrient ratios per ml
  - Formula provides complete plant nutrition in balanced proportions
  - Plants consume nutrients proportionally to this same ratio
  - Prevents nutrient imbalance from accumulating over time

- **Plant Condition System**:
  - Add `condition: 0-100%` to plants (like fish health)
  - Condition improves when nutrients sufficient
  - Condition degrades when nutrients insufficient
  - Species-specific nutrient demand: low, medium, high
  - Low-demand plants can survive on nitrate alone (slow growth)
  - High-demand plants need full nutrients or decline

- **Plant Die-off Mechanics**:
  - Low condition triggers shedding (size decreases)
  - Plant dies when condition drops below 10%
  - Dead plants add waste to tank (organic matter)
  - Relaxed thresholds give user margin for error

- **Phosphate from Decay**:
  - Decay system produces trace phosphate (in addition to waste)
  - Links fish bioload to partial plant nutrition
  - Not enough for demanding plants, but sustains low-tech setups

- **Manual Dose Action**:
  - User specifies amount in ml
  - Adds nutrients per fertilizer formula
  - UI button in Actions panel with amount input

- **Auto Doser Equipment**:
  - Schedule-based dosing (uses existing DailySchedule)
  - Configurable dose amount (ml)
  - Enabled/disabled toggle
  - Doses once per day when schedule active

- **Algae Competition Update**:
  - Algae growth factors in nutrient availability
  - Excess nutrients + light = algae bloom opportunity
  - Plants competing for same nutrients starves algae

- **UI Updates**:
  - Nutrients panel showing individual nutrient levels
  - Visual indicators (low/optimal/high) per nutrient
  - Dose button with amount input in Actions
  - Auto Doser configuration in Equipment panel

### Out of Scope

- **Multiple fertilizer types** - Single all-in-one formula only
- **Nutrient deficiency symptoms** - Visual plant changes (yellowing, etc.)
- **Substrate nutrient release** - Aqua soil buffering deferred
- **Complex chemistry** - No nutrient interactions or lockout
- **Per-plant nutrient requirements** - Species demand is aggregate, not per-nutrient

## Architecture

### Nutrient Resources

Add to resources state:

```typescript
interface NutrientResources {
  nitrate: number;      // mg (already exists)
  phosphate: number;    // mg (new)
  potassium: number;    // mg (new)
  iron: number;         // mg (new)
}
```

### Fertilizer Formula

Define the all-in-one fertilizer composition:

```typescript
// Nutrients provided per 1ml of fertilizer
const FERTILIZER_FORMULA = {
  nitrate: 5.0,     // mg per ml
  phosphate: 0.5,   // mg per ml
  potassium: 2.0,   // mg per ml
  iron: 0.1,        // mg per ml
};

// This ratio is also used for plant consumption
// Plants consume nutrients in this proportion
```

### Plant Condition

Extend Plant interface:

```typescript
interface Plant {
  id: string;
  species: PlantSpecies;
  size: number;
  condition: number;  // 0-100%, new
}
```

Add nutrient demand to species:

```typescript
interface PlantSpeciesData {
  // ... existing
  nutrientDemand: 'low' | 'medium' | 'high';
}
```

### Nutrient Sufficiency Calculation

Plants check if nutrients meet their needs:

```typescript
// Calculate nutrient sufficiency (0-1 scale)
function calculateNutrientSufficiency(
  resources: Resources,
  waterVolume: number,
  species: PlantSpeciesData
): number {
  const demandMultiplier = {
    low: 0.3,      // Can survive on 30% of optimal
    medium: 0.6,   // Needs 60% of optimal
    high: 1.0,     // Needs full optimal
  };

  const demand = demandMultiplier[species.nutrientDemand];

  // Check each nutrient against optimal ppm thresholds
  const nitratePpm = (resources.nitrate / waterVolume) * 1000;
  const phosphatePpm = (resources.phosphate / waterVolume) * 1000;
  const potassiumPpm = (resources.potassium / waterVolume) * 1000;
  const ironPpm = (resources.iron / waterVolume) * 1000;

  // Sufficiency = min factor across all nutrients
  const factors = [
    Math.min(1, nitratePpm / (OPTIMAL_NITRATE_PPM * demand)),
    Math.min(1, phosphatePpm / (OPTIMAL_PHOSPHATE_PPM * demand)),
    Math.min(1, potassiumPpm / (OPTIMAL_POTASSIUM_PPM * demand)),
    Math.min(1, ironPpm / (OPTIMAL_IRON_PPM * demand)),
  ];

  return Math.min(...factors);
}
```

### Condition Update Logic

```typescript
function updatePlantCondition(plant: Plant, sufficiency: number): void {
  if (sufficiency >= 0.8) {
    // Thriving: condition improves
    plant.condition = Math.min(100, plant.condition + CONDITION_RECOVERY_RATE);
  } else if (sufficiency >= 0.5) {
    // Adequate: condition stable (slight recovery)
    plant.condition = Math.min(100, plant.condition + CONDITION_RECOVERY_RATE * 0.3);
  } else if (sufficiency >= 0.2) {
    // Struggling: condition slowly degrades
    plant.condition = Math.max(0, plant.condition - CONDITION_DECAY_RATE * 0.5);
  } else {
    // Starving: rapid condition loss
    plant.condition = Math.max(0, plant.condition - CONDITION_DECAY_RATE);
  }
}
```

### Shedding and Death

```typescript
function processPlantHealth(plant: Plant, state: SimulationState): void {
  // Shedding when condition is low
  if (plant.condition < 30) {
    const sheddingRate = (30 - plant.condition) / 30 * MAX_SHEDDING_RATE;
    const sizeReduction = plant.size * sheddingRate;
    plant.size -= sizeReduction;

    // Shed material becomes waste
    state.resources.waste += sizeReduction * WASTE_PER_SHED_SIZE;
  }

  // Death when condition below 10% OR size below 10%
  if (plant.condition < 10 || plant.size < 10) {
    // Plant dies: remove from array, add waste
    state.resources.waste += plant.size * WASTE_PER_PLANT_DEATH;
    // Mark for removal
    plant.size = 0; // Will be filtered out
  }
}
```

### Proportional Nutrient Consumption

Plants consume nutrients in the same ratio as fertilizer provides:

```typescript
function consumeNutrients(
  resources: Resources,
  consumptionRate: number  // Base consumption scaled by plant size/growth
): void {
  // Consume in fertilizer ratio
  const ratio = FERTILIZER_FORMULA;
  const total = ratio.nitrate + ratio.phosphate + ratio.potassium + ratio.iron;

  resources.nitrate -= consumptionRate * (ratio.nitrate / total);
  resources.phosphate -= consumptionRate * (ratio.phosphate / total);
  resources.potassium -= consumptionRate * (ratio.potassium / total);
  resources.iron -= consumptionRate * (ratio.iron / total);

  // Clamp to 0
  resources.nitrate = Math.max(0, resources.nitrate);
  resources.phosphate = Math.max(0, resources.phosphate);
  resources.potassium = Math.max(0, resources.potassium);
  resources.iron = Math.max(0, resources.iron);
}
```

### Decay System Update

Add phosphate production to decay:

```typescript
// In decay system, after waste production
const phosphateProduced = decayedMass * PHOSPHATE_PER_DECAY;
effects.push({
  resource: 'phosphate',
  delta: phosphateProduced,
  source: 'decay'
});
```

### Dosing Action

```typescript
function dose(state: SimulationState, amountMl: number): SimulationState {
  return produce(state, draft => {
    draft.resources.nitrate += amountMl * FERTILIZER_FORMULA.nitrate;
    draft.resources.phosphate += amountMl * FERTILIZER_FORMULA.phosphate;
    draft.resources.potassium += amountMl * FERTILIZER_FORMULA.potassium;
    draft.resources.iron += amountMl * FERTILIZER_FORMULA.iron;

    // Log action
  });
}
```

### Auto Doser Equipment

```typescript
interface AutoDoser {
  enabled: boolean;
  schedule: DailySchedule;  // Reuse existing schedule type
  doseAmountMl: number;
}

// In equipment processing
function processAutoDoser(state: SimulationState): SimulationState {
  const { autoDoser } = state.equipment;
  if (!autoDoser.enabled) return state;

  const hourOfDay = state.tick % 24;

  // Dose at start hour only (once per day)
  if (hourOfDay === autoDoser.schedule.startHour) {
    return dose(state, autoDoser.doseAmountMl);
  }

  return state;
}
```

### Algae Growth Update

```typescript
// Algae benefits from excess nutrients
const nutrientFactor = Math.min(
  resources.nitrate / OPTIMAL_NITRATE,
  resources.phosphate / OPTIMAL_PHOSPHATE,
  // K and Fe less relevant for algae
) / 1.0;  // 1.0 = optimal, > 1.0 = excess

// Excess nutrients boost algae
const algaeNutrientBoost = Math.max(1.0, nutrientFactor);
algaeGrowth *= algaeNutrientBoost;
```

## Implementation

### 1. Add Nutrient Resources (`src/simulation/state.ts`)
- Add `phosphate`, `potassium`, `iron` to resources
- Initialize to 0 in default state
- Update `Resources` interface

### 2. Nutrient Config (`src/simulation/config/nutrients.ts`)
- `FERTILIZER_FORMULA` - nutrients per ml
- `OPTIMAL_*_PPM` thresholds for each nutrient
- `CONDITION_RECOVERY_RATE`, `CONDITION_DECAY_RATE`
- `MAX_SHEDDING_RATE`, `WASTE_PER_SHED_SIZE`, `WASTE_PER_PLANT_DEATH`
- `PHOSPHATE_PER_DECAY` - phosphate from decay

### 3. Extend Plant Model (`src/simulation/state.ts`)
- Add `condition` to Plant interface
- Add `nutrientDemand` to PlantSpeciesData
- Update species catalog with demand levels
- Initialize new plants with condition: 100

### 4. Update Decay System (`src/simulation/systems/decay.ts`)
- Add phosphate effect alongside waste production
- Proportional to decayed mass

### 5. Nutrient Consumption (`src/simulation/systems/plant-growth.ts`)
- Calculate nutrient sufficiency per plant
- Update plant condition based on sufficiency
- Process shedding when condition low
- Remove dead plants (condition < 10 or size < 10)
- Consume nutrients proportionally after growth

### 6. Dosing Action (`src/simulation/actions/dose.ts`)
- `dose(state, amountMl)` - add nutrients per formula
- `canDose(state)` - always available if plants exist
- Log dosing amount

### 7. Auto Doser Equipment (`src/simulation/equipment/auto-doser.ts`)
- Add `AutoDoser` to equipment state
- Process in equipment phase
- Dose at schedule start hour
- Log auto-dose events

### 8. Update Algae System (`src/simulation/systems/algae.ts`)
- Factor in nutrient levels for growth
- Excess nutrients boost algae growth

### 9. UI - Nutrients Panel (`src/ui/components/resources/NutrientsPanel.tsx`)
- Display each nutrient with current ppm
- Color-coded bars: red (low), green (optimal), yellow (high)
- Thresholds based on optimal ranges

### 10. UI - Actions Panel
- Add "Dose" button
- Amount input (ml) with reasonable default
- Show fertilizer effect preview

### 11. UI - Equipment Panel
- Auto Doser configuration
- Enable/disable toggle
- Schedule (start hour, but duration=1 for single dose)
- Dose amount slider/input

### 12. UI - Plants Panel Update
- Show condition bar per plant alongside size
- Color-code condition: green (healthy), yellow (struggling), red (dying)

## Acceptance Criteria

### Nutrient Resources
- [ ] Phosphate, Potassium, Iron added as mass-based resources
- [ ] Displayed as ppm (derived from mass/volume)
- [ ] Persisted in state correctly

### Fertilizer & Dosing
- [ ] Fertilizer formula defined with balanced ratios
- [ ] Manual dose action adds nutrients per formula
- [ ] Dose action logged with amount
- [ ] Auto Doser doses at scheduled time
- [ ] Auto Doser configurable (amount, schedule, enable)

### Decay Phosphate
- [ ] Decay system produces trace phosphate
- [ ] Amount proportional to decayed mass
- [ ] Creates natural nutrient source from fish bioload

### Plant Condition
- [ ] Plants have condition (0-100%)
- [ ] Species have nutrient demand (low/medium/high)
- [ ] Condition improves when nutrients sufficient
- [ ] Condition degrades when nutrients insufficient
- [ ] Low-demand plants survive on nitrate alone

### Die-off Mechanics
- [ ] Shedding occurs when condition < 30%
- [ ] Shedding rate increases as condition drops
- [ ] Shed material adds to waste
- [ ] Plant dies when condition < 10% or size < 10%
- [ ] Dead plant adds waste and is removed

### Nutrient Consumption
- [ ] Plants consume nutrients proportionally to fertilizer ratio
- [ ] Prevents individual nutrient accumulation
- [ ] Consumption scales with plant size and growth rate

### Algae Integration
- [ ] Algae growth factors in nutrient levels
- [ ] Excess nutrients boost algae
- [ ] Plants competing for nutrients can starve algae

### UI
- [ ] Nutrients panel shows all 4 nutrients with ppm
- [ ] Visual indicators for low/optimal/high
- [ ] Dose button with amount input
- [ ] Auto Doser settings in Equipment
- [ ] Plant condition shown in Plants panel

### Integration
- [ ] Low-tech tank (no dosing) sustains low-demand plants
- [ ] High-tech tank (dosing) enables high-demand plant growth
- [ ] Overdosing leads to algae bloom (not instant death)
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Calibration Notes

**Nutrient Thresholds (approximate):**
- Nitrate: optimal 10-20 ppm (already calibrated)
- Phosphate: optimal 0.5-2 ppm
- Potassium: optimal 5-20 ppm
- Iron: optimal 0.1-0.5 ppm

**Fertilizer Formula per ml:**
- Should provide ~1 day of nutrients for moderate plant load
- User doses 1-5ml daily depending on plant mass

**Condition Rates:**
- Recovery: ~2-5% per tick when thriving
- Decay: ~1-3% per tick when starving
- Provides several ticks warning before death

**Low-tech Balance:**
- Fish waste → nitrate (covers ~50-70% of low-demand plant needs)
- Decay → phosphate (covers ~20-30%)
- Missing K and Fe limits growth but doesn't kill low-demand plants

**Overdose Margin:**
- 2-3x optimal nutrients before algae significantly benefits
- Gives user room for imprecise dosing

## Tests

Focus on >90% coverage for:
- Nutrient sufficiency calculation for each demand level
- Condition update logic (thriving, adequate, struggling, starving)
- Shedding mechanics and waste production
- Plant death conditions and cleanup
- Proportional nutrient consumption
- Decay phosphate production
- Dosing action correctness
- Auto Doser scheduling
- Algae nutrient interaction
- Full lifecycle: healthy → starving → shedding → death

## Notes

- **Proportional consumption is key**: Prevents one nutrient from depleting while others accumulate. Makes dosing intuitive - just add more fertilizer.
- **Natural ecosystem viable**: The decay → phosphate link plus nitrogen cycle → nitrate means a balanced fish load can sustain low-demand plants indefinitely without dosing.
- **Condition is like fish health**: Familiar mechanic, creates urgency when plants struggle.
- **Relaxed thresholds**: User has margin for error. Missing a dose doesn't kill plants immediately. Overdosing causes algae, not plant death.
- **Iron as micronutrient proxy**: Represents all micronutrients. Keeps model simple while allowing "micro deficiency" gameplay.

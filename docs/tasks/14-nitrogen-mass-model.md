# Task 14: Nitrogen Compounds - Mass-Based Storage Model

**Status:** completed

## Overview

Refactor nitrogen compounds (ammonia, nitrite, nitrate) from concentration-based storage (ppm) to mass-based storage (mg). This enables physically accurate dilution behavior: evaporation concentrates particles automatically, and water changes dilute proportionally without needing a dedicated Dilution system.

## Motivation

**Current problem:** Nitrogen compounds are stored as ppm (concentration). When water evaporates, the ppm should increase (same mass in less volume), but currently it doesn't - the nitrogen cycle has no awareness of volume changes.

**The elegant solution:** Store the conserved quantity (mass in mg) and derive concentration (ppm) when needed:

```
ppm = mass_mg / water_liters
```

This makes concentration changes **implicit in the math**:
- Evaporation removes water → derived ppm increases automatically (same mass, less volume)
- Water change removes water+mass proportionally → straightforward mass subtraction
- No "Dilution system" needed for chemistry - it's just physics

**Why this is cleaner:**
- Mass is the physically conserved quantity - molecules don't disappear when water evaporates
- Eliminates the need for tracking `previousWater` or temporal bookkeeping
- Removes an entire system (Dilution for concentration) from the architecture
- Aligns with how chemistry actually works

## References

- [5-RESOURCES.md](../5-RESOURCES.md) - Resource definitions (ammonia, nitrite, nitrate in ppm)
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Nitrogen cycle system
- [nitrogen-cycle.ts](../../src/simulation/systems/nitrogen-cycle.ts) - Current implementation

## Scope

### In Scope

**Storage model change:**
- Store `ammonia`, `nitrite`, `nitrate` as mass in milligrams (mg)
- Derive ppm for display, alerts, and bacterial threshold checks: `ppm = mass / water`
- Update resource definitions with new units and bounds

**Nitrogen cycle updates:**
- Waste → ammonia conversion outputs mass (mg) instead of ppm
- AOB/NOB processing works in mass terms
- Spawning/death thresholds check derived ppm (behavior unchanged)

**Effects system:**
- Effects emit mass deltas (mg) for nitrogen compounds
- Bounds checking uses mass bounds

**UI and alerts:**
- Display derived ppm to user (they don't see mass internally)
- Alert thresholds still use ppm (derived from mass/water)

### Out of Scope

- Water Change action (separate task, will use this foundation)
- Temperature blending (separate concern)
- pH (not implemented yet)
- Other resources (food, waste, algae remain as-is)

## Implementation

### 1. Update Resource Definitions

**Update `src/simulation/resources/` for nitrogen compounds:**

```typescript
// ammonia.ts
export const AmmoniaResource: ResourceDefinition = {
  key: 'ammonia',
  unit: 'mg',           // Changed from ppm
  bounds: { min: 0, max: 10000 },  // Mass bounds in mg
  defaultValue: 0,
  precision: 3,
  // Format displays derived ppm, not raw mass
  format: (mass: number, waterLiters?: number) => {
    if (!waterLiters || waterLiters <= 0) return '0.00 ppm';
    const ppm = mass / waterLiters;
    return `${ppm.toFixed(2)} ppm`;
  },
};
```

Same pattern for `nitrite.ts` and `nitrate.ts`.

**Add ppm derivation helper:**

```typescript
// src/simulation/resources/helpers.ts
export function getPpm(mass: number, waterLiters: number): number {
  if (waterLiters <= 0) return 0;
  return mass / waterLiters;
}

export function getMassFromPpm(ppm: number, waterLiters: number): number {
  return ppm * waterLiters;
}
```

### 2. Update Nitrogen Cycle System

**Stage 1: Waste → Ammonia**

Current:
```typescript
const ammoniaProduced = wasteConsumed * (1.0 / waterVolume); // ppm
```

New:
```typescript
const ammoniaProduced = wasteConsumed * WASTE_TO_AMMONIA_RATIO; // mg
// where WASTE_TO_AMMONIA_RATIO converts grams waste to mg ammonia
```

**Stages 2 & 3: AOB/NOB processing**

Current: works in ppm, emits ppm deltas
New: works in mass, emits mass deltas

```typescript
// Calculate derived ppm for processing rate
const ammoniaPpm = getPpm(currentAmmoniaMass, resources.water);

// Processing happens in mass terms
const massProcessed = calculateAmmoniaToNitrite(ammoniaPpm, aobPopulation) * resources.water;

effects.push({
  tier: 'passive',
  resource: 'ammonia',
  delta: -massProcessed,  // mg
  source: 'nitrogen-cycle-aob',
});
```

**Spawning/Death thresholds:**

Continue using ppm thresholds (biologically meaningful), but derive from mass:

```typescript
const ammoniaPpm = getPpm(currentAmmoniaMass, resources.water);
if (currentAob === 0 && ammoniaPpm >= AOB_SPAWN_THRESHOLD) {
  // spawn
}
```

### 3. Update Effects System

**In `applyEffects()`:**

Nitrogen compounds now use mass bounds:

```typescript
case 'ammonia':
case 'nitrite':
case 'nitrate':
  draft.resources[effect.resource] = clamp(
    draft.resources[effect.resource] + effect.delta,
    resource.bounds.min,  // 0
    resource.bounds.max   // 10000 mg or similar
  );
  break;
```

### 4. Update Alerts

**Alerts check derived ppm:**

```typescript
// high-ammonia.ts
const ammoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
if (ammoniaPpm > AMMONIA_DANGER_THRESHOLD) {
  // alert
}
```

### 5. Update UI Components

**WaterChemistry panel and similar:**

```typescript
const ammoniaPpm = getPpm(resources.ammonia, resources.water);
// Display: ammoniaPpm.toFixed(2) + ' ppm'
```

Or use the resource formatter which takes water as second argument.

### 6. Update State Initialization

**In `createSimulation()`:**

Initialize nitrogen compounds to 0 mg (not 0 ppm - same value, different meaning).

### 7. Update Tests

- Update nitrogen cycle tests to work with mass
- Verify ppm derivation works correctly
- Test that evaporation now automatically concentrates (integration test)

## Acceptance Criteria

### Storage Model
- [ ] `resources.ammonia`, `resources.nitrite`, `resources.nitrate` store mass in mg
- [ ] Helper function `getPpm(mass, water)` derives concentration
- [ ] Helper function `getMassFromPpm(ppm, water)` converts back

### Nitrogen Cycle
- [ ] Waste → ammonia conversion produces mass (mg)
- [ ] AOB/NOB processing emits mass deltas
- [ ] Spawning thresholds still use ppm (derived from mass/water)
- [ ] Death thresholds still use ppm (derived from mass/water)
- [ ] Existing nitrogen cycle behavior unchanged (same ppm outcomes)

### Automatic Concentration
- [ ] When water decreases (evaporation), derived ppm increases automatically
- [ ] No explicit "concentration" effects needed
- [ ] Integration test: evaporate water, verify ppm increases proportionally

### Alerts & UI
- [ ] Alerts check derived ppm, not raw mass
- [ ] UI displays ppm (user never sees mass)
- [ ] Resource formatters handle ppm derivation

### Tests
- [ ] All existing tests pass (behavior unchanged, storage changed)
- [ ] New tests for ppm derivation helpers
- [ ] Integration test for evaporation → concentration effect
- [ ] Build and lint pass

## Notes

- **User-facing values unchanged** - Users see ppm in UI, alerts use ppm thresholds. The mass storage is an internal implementation detail.
- **Prepares for Water Change** - With mass-based storage, Water Change action simply removes proportional mass when removing water, and adds no mass when adding fresh tap water.
- **Bacterial thresholds in ppm** - Biologically, bacteria respond to concentration (ppm), not total mass. Keep spawn/death thresholds as ppm checks on derived values.
- **Constants may need adjustment** - `BACTERIA_PROCESSING_RATE` is currently "ppm per bacteria per tick". May need reframing as "mass processed per bacteria per tick" or keep as ppm rate and convert.

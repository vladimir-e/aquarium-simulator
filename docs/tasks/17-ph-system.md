# Task 17: pH System

**Status:** pending

**Depends on:** Task 16 (Gas Exchange) - uses CO2 for pH interaction

## Overview

Implement pH as a tracked resource with tap water pH for blending during water changes and ATO. pH is affected by hardscape (calcite raises, driftwood lowers) and dissolved CO2 (more CO2 = lower pH via carbonic acid formation).

pH blending uses chemically accurate H+ concentration math rather than simple averaging, since pH is logarithmic.

## References

- [2-ENVIRONMENT.md](../2-ENVIRONMENT.md) - Tap water pH environment parameter (Lines 42-55)
- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Hardscape pH effects (Lines 173-187)
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Dilution & Blending (Lines 293-366)
- [5-RESOURCES.md](../5-RESOURCES.md) - pH resource definition (Lines 129-142)

## Scope

### In Scope

**New resource:**
- `ph` - tank pH value (0-14 scale, typical aquarium range 6.0-8.0)

**New environment parameter:**
- `tapWaterPH` - pH of water used for top-offs and water changes (default 6.5)

**pH blending (chemically accurate):**
- Convert pH to H+ concentration: `[H+] = 10^(-pH)`
- Blend H+ concentrations by volume-weighted average
- Convert back to pH: `pH = -log10([H+])`
- Used by water change and ATO actions

**pH drift system (PASSIVE tier):**
- Hardscape effect: calcite rock pushes pH up, driftwood pushes pH down
- Drift uses exponential approach toward target (similar to gas exchange)
- Multiple items of same type = stronger effect
- Neutral equilibrium around 7.0 when no hardscape present

**CO2 → pH interaction:**
- High CO2 lowers pH (carbonic acid: CO2 + H2O ⇌ H2CO3)
- Effect scales with CO2 concentration
- Creates realistic planted tank dynamics (CO2 injection lowers pH during day)

**UI updates:**
- Environment controls: tap water pH slider (similar to tap water temperature)
- WaterChemistry panel: display current pH with color coding

### Out of Scope

- Nitrogen cycle pH effect (nitrification produces H+, lowers pH) - separate task
- KH/carbonate buffering (would resist pH changes) - simplified model
- pH alerts - can add later based on livestock requirements
- pH dosing (pH up/down additives) - future action

## Implementation

### 1. Add pH to Resources

**Update `src/simulation/state.ts`:**

Add to `Resources` interface:
```typescript
/** Tank pH (0-14 scale, typical 6.0-8.0) */
ph: number;
```

Add to `createSimulation()` initial resources:
```typescript
ph: 6.5,  // Slightly acidic, matches NYC tap water default
```

### 2. Add Tap Water pH to Environment

**Update `src/simulation/state.ts`:**

Add to `Environment` interface:
```typescript
/** Tap water pH for water changes and ATO */
tapWaterPH: number;
```

Add to `SimulationConfig` and `createSimulation()`:
```typescript
tapWaterPH: 6.5,  // NYC tap water default
```

### 3. Create pH Blending Function

**Update `src/simulation/core/blending.ts`:**

```typescript
/**
 * Convert pH to hydrogen ion concentration [H+].
 * pH is logarithmic: pH = -log10([H+])
 */
export function phToHydrogen(ph: number): number {
  return Math.pow(10, -ph);
}

/**
 * Convert hydrogen ion concentration back to pH.
 */
export function hydrogenToPh(hydrogen: number): number {
  if (hydrogen <= 0) return 7.0; // Neutral fallback
  return -Math.log10(hydrogen);
}

/**
 * Blend pH when mixing water volumes.
 * Uses chemically accurate H+ concentration blending.
 *
 * @param existingPH - pH of existing water
 * @param existingVolume - Volume of existing water (L)
 * @param addedPH - pH of water being added
 * @param addedVolume - Volume of water being added (L)
 * @returns Blended pH, rounded to 2 decimal places
 */
export function blendPH(
  existingPH: number,
  existingVolume: number,
  addedPH: number,
  addedVolume: number
): number {
  const totalVolume = existingVolume + addedVolume;
  if (totalVolume <= 0) return existingPH;

  // Convert to H+ concentrations
  const existingH = phToHydrogen(existingPH);
  const addedH = phToHydrogen(addedPH);

  // Volume-weighted average of H+ concentration
  const blendedH = (existingH * existingVolume + addedH * addedVolume) / totalVolume;

  // Convert back to pH
  return +hydrogenToPh(blendedH).toFixed(2);
}
```

### 4. Create pH Drift System

**Create `src/simulation/systems/ph-drift.ts`:**

Constants:
```typescript
// Hardscape pH effects (delta toward neutral 7.0 per item per tick)
export const HARDSCAPE_PH_EFFECT: Record<HardscapeType, number> = {
  neutral_rock: 0,
  calcite_rock: 0.02,      // Raises pH toward ~8.0
  driftwood: -0.015,       // Lowers pH toward ~6.0
  plastic_decoration: 0,
};

// pH targets for hardscape types
export const CALCITE_TARGET_PH = 8.0;
export const DRIFTWOOD_TARGET_PH = 6.0;
export const NEUTRAL_PH = 7.0;

// Base drift rate (fraction toward target per tick)
export const BASE_PH_DRIFT_RATE = 0.05;

// CO2 effect on pH
// At atmospheric CO2 (~4 mg/L), no effect
// Each mg/L above atmospheric lowers pH by this amount
export const CO2_PH_COEFFICIENT = -0.02;
export const CO2_NEUTRAL_LEVEL = 4.0;  // Atmospheric equilibrium
```

Key functions:
```typescript
/**
 * Calculate the target pH based on hardscape items.
 * Multiple items of same type have cumulative effect.
 */
export function calculateHardscapeTargetPH(items: HardscapeItem[]): number {
  let target = NEUTRAL_PH;
  let calciteCount = 0;
  let driftwoodCount = 0;

  for (const item of items) {
    if (item.type === 'calcite_rock') calciteCount++;
    if (item.type === 'driftwood') driftwoodCount++;
  }

  // Weighted pull toward respective targets
  // More items = stronger pull, but with diminishing returns
  if (calciteCount > 0) {
    const calcitePull = 1 - Math.pow(0.7, calciteCount); // Approaches 1 asymptotically
    target += (CALCITE_TARGET_PH - NEUTRAL_PH) * calcitePull;
  }
  if (driftwoodCount > 0) {
    const driftwoodPull = 1 - Math.pow(0.7, driftwoodCount);
    target += (DRIFTWOOD_TARGET_PH - NEUTRAL_PH) * driftwoodPull;
  }

  return target;
}

/**
 * Calculate pH adjustment from CO2 level.
 * High CO2 lowers pH (carbonic acid formation).
 */
export function calculateCO2PHEffect(co2: number): number {
  const co2Excess = co2 - CO2_NEUTRAL_LEVEL;
  return co2Excess * CO2_PH_COEFFICIENT;
}
```

System implementation (PASSIVE tier):
```typescript
export const phDriftSystem: System = {
  id: 'ph-drift',
  tier: 'passive',

  update(state: SimulationState): Effect[] {
    const { resources, hardscape } = state;

    // Calculate target pH from hardscape
    const hardscapeTarget = calculateHardscapeTargetPH(hardscape.items);

    // Calculate CO2 effect (additive to current pH)
    const co2Effect = calculateCO2PHEffect(resources.co2);

    // Effective target = hardscape target + CO2 effect
    const effectiveTarget = hardscapeTarget + co2Effect;

    // Drift toward target
    const phDelta = BASE_PH_DRIFT_RATE * (effectiveTarget - resources.ph);

    if (Math.abs(phDelta) < 0.001) return [];

    return [{
      tier: 'passive',
      resource: 'ph',
      delta: phDelta,
      source: 'ph-drift',
    }];
  },
};
```

### 5. Register pH Drift System

**Update `src/simulation/systems/index.ts`:**
- Import and export `phDriftSystem`
- Add to PASSIVE tier systems list (after gas-exchange, since it uses CO2)

### 6. Update Water Change Action

**Update `src/simulation/actions/water-change.ts`:**

After temperature and gas blending, add pH blending:
```typescript
// Blend pH using H+ concentration math
const tapPH = draft.environment.tapWaterPH;
draft.resources.ph = blendPH(
  draft.resources.ph, remainingWater,
  tapPH, waterAdded
);
```

### 7. Update ATO Equipment

**Update `src/simulation/equipment/ato.ts`:**

After temperature and gas blending, add pH blending:
```typescript
// Blend pH with tap water
const tapPH = state.environment.tapWaterPH;
draft.resources.ph = blendPH(
  draft.resources.ph, currentWater,
  tapPH, waterToAdd
);
```

### 8. Update Effect System

**Update `src/simulation/core/effects.ts`:**

Add 'ph' to the resource type and ensure `applyEffects` handles it with appropriate clamping (0-14 range).

### 9. UI Updates

**Environment controls:**
- Add tap water pH slider in EnvironmentCard (similar to tap temperature slider)
- Range: 5.5 - 8.5, step 0.1, default 6.5

**WaterChemistry panel:**
- Display current pH with color coding:
  - Blue (< 6.5) - acidic
  - Green (6.5-7.5) - neutral/ideal
  - Purple (> 7.5) - alkaline
- Show indicator arrow if drifting significantly

## Acceptance Criteria

### Resources
- [ ] `resources.ph` added (default 6.5)
- [ ] `environment.tapWaterPH` added (default 6.5)

### pH Blending
- [ ] `blendPH()` function uses H+ concentration math
- [ ] Blending pH 6.0 and 8.0 in equal volumes yields ~6.3 (not 7.0)
- [ ] Water change blends tank pH toward tap water pH
- [ ] ATO blends tank pH toward tap water pH

### pH Drift System
- [ ] System runs in PASSIVE tier
- [ ] No hardscape = pH drifts toward 7.0
- [ ] Calcite rock pushes pH up toward 8.0
- [ ] Driftwood pushes pH down toward 6.0
- [ ] Multiple items have cumulative effect with diminishing returns
- [ ] CO2 above atmospheric lowers pH
- [ ] CO2 at atmospheric has no pH effect

### UI
- [ ] Environment controls show tap water pH slider
- [ ] WaterChemistry panel displays current pH with color coding

### Tests
- [ ] `phToHydrogen()` and `hydrogenToPh()` are inverses
- [ ] `blendPH()` correctly handles equal volume mixing
- [ ] `blendPH()` correctly handles unequal volumes
- [ ] Hardscape target pH calculation works for various combinations
- [ ] CO2 effect on pH scales correctly
- [ ] pH drift moves toward target over time
- [ ] Water change pH blending works correctly
- [ ] ATO pH blending works correctly
- [ ] All tests pass, build succeeds, lint passes

## Notes

- **Logarithmic blending** - Simple averaging would be wrong. pH 6 + pH 8 averaged = pH 7, but chemically the H+ concentrations are 10^-6 + 10^-8 = ~1.01×10^-6, giving pH ~5.996. The acidic water dominates because it has 100x more H+ ions.

- **No buffering** - Real aquariums have KH (carbonate hardness) that resists pH changes. We're using a simplified model where pH can swing freely. This makes the simulation more dynamic/educational.

- **CO2 coupling** - During a planted tank's photoperiod: CO2 injection → high CO2 → lower pH. At night: CO2 off-gasses → pH rises. This creates realistic day/night pH swings.

- **Hardscape equilibrium** - With calcite rock and regular water changes with acidic tap water, you get an interesting equilibrium where hardscape pushes pH up and water changes pull it down.

## Doc Updates Required

After implementing this task, update:
- `docs/5-RESOURCES.md` - Add pH implementation details
- `docs/2-ENVIRONMENT.md` - Add tapWaterPH to implemented parameters
- `docs/3-EQUIPMENT.md` - Update hardscape section to note pH effects are now active

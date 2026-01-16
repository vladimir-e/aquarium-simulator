# Task 16: Oxygen, CO2, and Gas Exchange

**Status:** pending

**Depends on:** Task 15 (Water Change Action) - uses blending infrastructure

## Overview

Implement dissolved oxygen (O2) and carbon dioxide (CO2) resources with a gas exchange system that equilibrates these gases with the atmosphere. Gas exchange is fundamental to aquarium health - it supplies oxygen for fish respiration and removes excess CO2.

This task also adds proper O2/CO2 dilution to water changes and ATO, since fresh tap water comes saturated with O2 and at atmospheric CO2 levels.

## References

- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Gas Exchange system specification (Lines 151-203)
- [5-RESOURCES.md](../5-RESOURCES.md) - O2 and CO2 resource definitions
- [2-ENVIRONMENT.md](../2-ENVIRONMENT.md) - Ambient oxygen environment parameter

## Scope

### In Scope

**New resources (concentration-based, mg/L):**
- `oxygen` (O2) - dissolved oxygen, typical 6-8 mg/L
- `co2` - dissolved carbon dioxide, typical 3-5 mg/L (without injection)

**Gas Exchange system (PASSIVE tier):**
- O2 equilibrates toward temperature-dependent saturation
- CO2 equilibrates toward atmospheric level (~3-5 mg/L)
- Exchange rate scales with flow (more flow = faster equilibration)
- Exchange uses exponential decay toward equilibrium

**Temperature-dependent O2 saturation:**
- Colder water holds more O2 (Henry's Law)
- ~8 mg/L at 20°C, ~7 mg/L at 30°C

**Water change O2/CO2 blending:**
- Removed water takes its dissolved gases
- Added tap water comes saturated (O2 at saturation for tap temp, CO2 at atmospheric)
- Blend concentrations based on volume ratios

**ATO O2/CO2 blending:**
- Added tap water brings saturated O2 and atmospheric CO2
- Blend with existing tank concentrations

**Alerts:**
- Low O2 alert (< 4 mg/L = critical)
- High CO2 alert (> 30 mg/L = harmful)

**UI updates:**
- WaterChemistry panel: display current O2 and CO2 concentrations

### Out of Scope

- CO2 dosing/injection equipment (future task)
- pH interaction with CO2 (future - more CO2 = lower pH)
- Plant photosynthesis O2/CO2 exchange (future - plants system)
- Fish respiration O2/CO2 exchange (future - livestock system)
- Airstone/bubbler equipment (future)

## Implementation

### 1. Add O2 and CO2 to Resources

**Update `src/simulation/state.ts`:**

Add to `Resources` interface:
```typescript
// Chemical resources (dissolved gases) - stored as concentration (mg/L)
/** Dissolved oxygen in mg/L (healthy > 6, critical < 4) */
oxygen: number;
/** Dissolved CO2 in mg/L (atmospheric ~3-5, harmful > 30) */
co2: number;
```

Add to `createSimulation()` initial resources:
```typescript
// Dissolved gases (concentration in mg/L)
oxygen: 8.0,  // Start at saturation for 20°C
co2: 4.0,     // Start at atmospheric equilibrium
```

Add to `AlertState`:
```typescript
/** Oxygen below critical threshold (< 4 mg/L) */
lowOxygen: boolean;
/** CO2 above harmful threshold (> 30 mg/L) */
highCo2: boolean;
```

### 2. Create Gas Exchange System

**Create `src/simulation/systems/gas-exchange.ts`:**

Constants:
```typescript
// Atmospheric equilibrium values
export const ATMOSPHERIC_CO2 = 4.0;  // mg/L at equilibrium

// O2 saturation formula coefficients (simplified Henry's Law)
// Saturation decreases ~0.03 mg/L per °C increase
export const O2_SATURATION_BASE = 8.5;      // mg/L at 15°C
export const O2_SATURATION_SLOPE = -0.05;   // mg/L per °C
export const O2_REFERENCE_TEMP = 15;        // Reference temperature

// Exchange rate constants
export const BASE_EXCHANGE_RATE = 0.1;      // Fraction toward equilibrium per tick
export const OPTIMAL_FLOW_TURNOVER = 10;    // Tank turnovers/hour for max exchange
```

Key functions:
```typescript
/**
 * Calculate O2 saturation based on temperature.
 * Colder water holds more dissolved oxygen.
 */
export function calculateO2Saturation(temperature: number): number {
  const saturation = O2_SATURATION_BASE + O2_SATURATION_SLOPE * (temperature - O2_REFERENCE_TEMP);
  return Math.max(saturation, 4.0);  // Floor at 4 mg/L even at extreme temps
}

/**
 * Calculate flow factor for gas exchange.
 * More flow = faster equilibration, with diminishing returns.
 */
export function calculateFlowFactor(flow: number, tankCapacity: number): number {
  const turnovers = flow / tankCapacity;
  // Approaches 1.0 asymptotically as flow increases
  return Math.min(1.0, turnovers / OPTIMAL_FLOW_TURNOVER);
}

/**
 * Calculate gas exchange toward equilibrium.
 * Uses exponential decay: current + rate * (target - current)
 */
export function calculateGasExchange(
  current: number,
  target: number,
  baseRate: number,
  flowFactor: number
): number {
  const effectiveRate = baseRate * flowFactor;
  return effectiveRate * (target - current);
}
```

System implementation (PASSIVE tier):
- Calculate O2 saturation from current temperature
- Calculate flow factor from current flow and tank capacity
- Apply gas exchange formula for O2 toward saturation
- Apply gas exchange formula for CO2 toward atmospheric

### 3. Register Gas Exchange System

**Update `src/simulation/systems/index.ts`:**
- Import and export `gasExchangeSystem`
- Add to PASSIVE tier systems list

### 4. Update Water Change Action

**Update `src/simulation/actions/water-change.ts`:**

After nitrogen compound removal, add O2/CO2 blending:
```typescript
// Calculate tap water gas concentrations
const tapO2Saturation = calculateO2Saturation(tapTemp);
const tapCo2 = ATMOSPHERIC_CO2;

// Blend O2: remaining tank water + fresh tap water at saturation
draft.resources.oxygen = blendConcentration(
  draft.resources.oxygen, remainingWater,
  tapO2Saturation, waterRemoved
);

// Blend CO2: remaining tank water + fresh tap water at atmospheric
draft.resources.co2 = blendConcentration(
  draft.resources.co2, remainingWater,
  tapCo2, waterRemoved
);
```

### 5. Update ATO Equipment

**Update `src/simulation/equipment/ato.ts`:**

After temperature blending, add O2/CO2 blending:
```typescript
// Tap water comes saturated with O2 and at atmospheric CO2
const tapO2Saturation = calculateO2Saturation(tapTemp);
const tapCo2 = ATMOSPHERIC_CO2;

draft.resources.oxygen = blendConcentration(
  draft.resources.oxygen, currentWater,
  tapO2Saturation, waterToAdd
);

draft.resources.co2 = blendConcentration(
  draft.resources.co2, currentWater,
  tapCo2, waterToAdd
);
```

### 6. Add Concentration Blending Helper

**Update `src/simulation/core/blending.ts`:**

```typescript
/**
 * Blend concentration when mixing water volumes.
 * Simple weighted average for concentration-based resources.
 *
 * @param existingConc - Concentration in existing water (mg/L)
 * @param existingVolume - Volume of existing water (L)
 * @param addedConc - Concentration of water being added (mg/L)
 * @param addedVolume - Volume of water being added (L)
 * @returns Blended concentration (mg/L), rounded to 2 decimal places
 */
export function blendConcentration(
  existingConc: number,
  existingVolume: number,
  addedConc: number,
  addedVolume: number
): number {
  const totalVolume = existingVolume + addedVolume;
  if (totalVolume <= 0) return existingConc;

  const blended =
    (existingConc * existingVolume + addedConc * addedVolume) / totalVolume;
  return +blended.toFixed(2);
}
```

### 7. Add Alerts

**Update `src/simulation/core/alerts.ts`** (or wherever alerts are processed):

```typescript
// Low oxygen alert (< 4 mg/L)
if (resources.oxygen < 4 && !alertState.lowOxygen) {
  // Fire alert
  alertState.lowOxygen = true;
}
if (resources.oxygen >= 4 && alertState.lowOxygen) {
  alertState.lowOxygen = false;
}

// High CO2 alert (> 30 mg/L)
if (resources.co2 > 30 && !alertState.highCo2) {
  // Fire alert
  alertState.highCo2 = true;
}
if (resources.co2 <= 30 && alertState.highCo2) {
  alertState.highCo2 = false;
}
```

### 8. UI Updates

**Update `src/ui/components/panels/WaterChemistry.tsx`:**

Add O2 and CO2 display in a new "Dissolved Gases" section:
- O2 with color coding: green (> 6), yellow (4-6), red (< 4)
- CO2 with drop checker color spectrum:
  - Blue (< 10 mg/L) - low CO2, not enough for plants
  - Green (10-30 mg/L) - optimal range for planted tanks
  - Yellow (> 30 mg/L) - high CO2, potentially harmful to fish
- Display units as mg/L

## Acceptance Criteria

### Resources
- [ ] `resources.oxygen` added (concentration mg/L, default 8.0)
- [ ] `resources.co2` added (concentration mg/L, default 4.0)

### Gas Exchange System
- [ ] System runs in PASSIVE tier
- [ ] O2 equilibrates toward temperature-dependent saturation
- [ ] CO2 equilibrates toward atmospheric (~4 mg/L)
- [ ] Exchange rate scales with flow factor
- [ ] Low flow = slow equilibration, high flow = fast equilibration

### Temperature-dependent O2 Saturation
- [ ] Saturation decreases with temperature (~8 mg/L at 20°C, ~7 mg/L at 30°C)
- [ ] Formula is physically reasonable

### Water Change Blending
- [ ] Tap water brings saturated O2 (at tap temp)
- [ ] Tap water brings atmospheric CO2 (~4 mg/L)
- [ ] Concentrations blend correctly based on volumes

### ATO Blending
- [ ] ATO blends O2 concentration
- [ ] ATO blends CO2 concentration

### Alerts
- [ ] Low O2 alert fires when < 4 mg/L
- [ ] High CO2 alert fires when > 30 mg/L
- [ ] Alerts clear when conditions resolve

### UI
- [ ] WaterChemistry shows O2 concentration with color coding (green/yellow/red)
- [ ] WaterChemistry shows CO2 with drop checker colors (blue/green/yellow)

### Tests
- [ ] O2 saturation calculation varies with temperature
- [ ] Gas exchange moves toward equilibrium
- [ ] Flow factor affects exchange rate
- [ ] Water change blending works correctly
- [ ] ATO blending works correctly
- [ ] All tests pass, build succeeds, lint passes

## Notes

- **Concentration-based storage** - Unlike nitrogen compounds (mass-based), O2 and CO2 use concentration (mg/L) directly since gas exchange constantly adjusts toward equilibrium every tick. This simplifies the math.
- **No plants/fish interaction yet** - Plants will produce O2 during photosynthesis and consume CO2, fish will do the opposite. These are future tasks.
- **CO2 injection future** - When implemented, CO2 equipment will add to tank CO2, which then off-gasses via gas exchange. Users can do water changes to quickly reduce CO2 if overdosed.
- **Exchange rate tuning** - The BASE_EXCHANGE_RATE may need adjustment based on testing. Goal is ~1-2 hours to reach equilibrium with good flow.

## Doc Updates Required

After implementing this task, update:
- `docs/5-RESOURCES.md` - Add O2/CO2 implementation details (concentration-based)
- `docs/4-CORE-SYSTEMS.md` - Update Gas Exchange section with implemented constants

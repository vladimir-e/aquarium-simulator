# Task 09: Food, Decay, and Waste System

**Status:** completed

## Overview

Implement food and waste resources along with the decay system that converts uneaten food into waste. This establishes the foundation for the nitrogen cycle (future task) by creating the waste stock that feeds bacterial processes. Includes temperature-scaled decay rates and ambient waste from the environment.

## References

- [5-RESOURCES.md](../5-RESOURCES.md) - Food and Waste resource definitions
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Decay system specification
- [8-ACTIONS.md](../8-ACTIONS.md) - Feed action specification
- [2-ENVIRONMENT.md](../2-ENVIRONMENT.md) - Ambient waste from environment

## Scope

### In Scope
- **Food Resource**: Grams with 2 decimal precision (e.g., 0.25g)
- **Waste Resource**: Grams (organic matter stock)
- **Decay System**: PASSIVE tier effect that converts food → waste with temperature scaling
- **Ambient Waste**: Small constant trickle from environment (seeds bacteria for testing)
- **Feed Action**: User action to add food to tank with configurable amount
- **UI - Food Indicator**: Orange circle in Livestock panel (intensity increases with food amount)
- **UI - Waste Display**: Waste amount in WaterChemistry panel
- **UI - Feed Button**: Add Feed action button to Actions panel
- **Logging**: Log feed actions and decay events (when significant)

### Out of Scope
- **Livestock Consumption**: Fish eating food (deferred to livestock task)
- **Auto Feeder Equipment**: Scheduled automatic feeding (deferred to equipment task)
- **Nitrogen Cycle**: Waste → ammonia conversion (separate task, requires bacteria)
- **Filter Waste Removal**: Mechanical filtration (deferred to filter task)
- **Substrate Vacuuming**: Clean substrate action (deferred to actions task)
- **Overfeeding Alerts**: Warning when too much food added (can be added to logging if time permits)

## Architecture

### State Extensions

```typescript
export interface Resources {
  /** Water temperature in °C */
  temperature: number;
  /** Food available for consumption (grams, 2 decimal precision) */
  food: number;
  /** Organic waste accumulation (grams) */
  waste: number;
}

export interface Environment {
  /** Room/ambient temperature in °C */
  roomTemperature: number;
  /** Ambient waste production rate (g/hour) - very small, seeds bacteria */
  ambientWaste: number;
}

export type ActionType = 'topOff' | 'feed';

export interface TopOffAction {
  type: 'topOff';
}

export interface FeedAction {
  type: 'feed';
  /** Amount of food to add in grams */
  amount: number;
}

export type Action = TopOffAction | FeedAction;
```

### Decay System Specification

Based on [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md):

**Formula:**
```typescript
decay_output = base_rate * temperature_factor * food_amount
```

**Temperature Factor:**
```typescript
// Q10 coefficient: rate doubles every 10°C
// Reference temp: 25°C
const Q10 = 2.0;
const REFERENCE_TEMP = 25.0;

function getTemperatureFactor(temperature: number): number {
  const tempDiff = temperature - REFERENCE_TEMP;
  return Math.pow(Q10, tempDiff / 10.0);
}
```

**Base Rate:**
```typescript
// Base decay rate at reference temperature (25°C)
// Food decays to waste at ~5% per hour at 25°C
const BASE_DECAY_RATE = 0.05; // 5% per hour
```

**Decay Calculation:**
```typescript
function calculateDecay(food: number, temperature: number): number {
  const tempFactor = getTemperatureFactor(temperature);
  const decayAmount = food * BASE_DECAY_RATE * tempFactor;
  return Math.min(decayAmount, food); // Can't decay more than available
}
```

**Examples:**
- At 20°C: ~2.8% per hour (slower)
- At 25°C: ~5% per hour (reference)
- At 30°C: ~9% per hour (faster)

### Ambient Waste

From environment spec:

```typescript
// Very small constant waste production (g/hour)
// Simulates dust, small debris, organic matter
// Purpose: Seeds bacteria even without fish, allows testing nitrogen cycle
const AMBIENT_WASTE_RATE = 0.01; // 0.01g per hour = 0.24g per day
```

### Effect Tiers

Following the three-tier effect system from [1-DESIGN.md](../1-DESIGN.md):

**PASSIVE Tier** (decay runs here):
- Decay: Food → Waste (temperature-scaled)
- Ambient Waste: Environment → Waste stock

```typescript
// In decay.ts
export function collectDecayEffects(state: SimulationState): Effect[] {
  const effects: Effect[] = [];

  // Decay food to waste
  if (state.resources.food > 0) {
    const decayAmount = calculateDecay(
      state.resources.food,
      state.resources.temperature
    );

    effects.push({
      tier: 'passive',
      resource: 'food',
      delta: -decayAmount,
      source: 'decay',
    });

    effects.push({
      tier: 'passive',
      resource: 'waste',
      delta: decayAmount,
      source: 'decay',
    });
  }

  // Ambient waste from environment
  effects.push({
    tier: 'passive',
    resource: 'waste',
    delta: state.environment.ambientWaste,
    source: 'environment',
  });

  return effects;
}
```

### Feed Action

From [8-ACTIONS.md](../8-ACTIONS.md):

```typescript
// In actions.ts
export function executeFeedAction(state: SimulationState, action: FeedAction): Effect[] {
  return [
    {
      tier: 'immediate',
      resource: 'food',
      delta: action.amount,
      source: 'user_action',
    },
  ];
}
```

**UI Input:**
- Default amount: 0.5g (typical pinch of food)
- Input step: 0.1g
- Range: 0.1g - 5.0g
- Format: Show as "0.5g" with 1 decimal place in UI

## Implementation

### 1. State Updates (`src/simulation/state.ts`)

- Add `food` and `waste` to `Resources` interface
- Add `ambientWaste` to `Environment` interface
- Update `FeedAction` interface and `Action` union type
- Update defaults:
  ```typescript
  export const DEFAULT_RESOURCES: Resources = {
    temperature: 25.0,
    food: 0.0,
    waste: 0.0,
  };

  export const DEFAULT_ENVIRONMENT: Environment = {
    roomTemperature: 22.0,
    ambientWaste: 0.01, // 0.01 g/hour
  };
  ```

### 2. Decay System (`src/simulation/core/decay.ts`)

New file:
```typescript
import type { SimulationState, Effect } from '../state.js';

/** Q10 temperature coefficient (rate doubles every 10°C) */
const Q10 = 2.0;

/** Reference temperature for decay rate (°C) */
const REFERENCE_TEMP = 25.0;

/** Base decay rate at reference temperature (fraction per hour) */
const BASE_DECAY_RATE = 0.05; // 5% per hour at 25°C

/**
 * Calculate temperature factor for decay rate using Q10 coefficient
 */
function getTemperatureFactor(temperature: number): number {
  const tempDiff = temperature - REFERENCE_TEMP;
  return Math.pow(Q10, tempDiff / 10.0);
}

/**
 * Calculate amount of food that decays to waste this tick
 */
function calculateDecay(food: number, temperature: number): number {
  if (food <= 0) return 0;

  const tempFactor = getTemperatureFactor(temperature);
  const decayAmount = food * BASE_DECAY_RATE * tempFactor;

  // Can't decay more than available food
  return Math.min(decayAmount, food);
}

/**
 * Collect decay effects (PASSIVE tier)
 * - Food decays to waste (temperature-scaled)
 * - Ambient waste from environment
 */
export function collectDecayEffects(state: SimulationState): Effect[] {
  const effects: Effect[] = [];

  // Decay food → waste
  if (state.resources.food > 0) {
    const decayAmount = calculateDecay(
      state.resources.food,
      state.resources.temperature
    );

    if (decayAmount > 0) {
      effects.push({
        tier: 'passive',
        resource: 'food',
        delta: -decayAmount,
        source: 'decay',
      });

      effects.push({
        tier: 'passive',
        resource: 'waste',
        delta: decayAmount,
        source: 'decay',
      });
    }
  }

  // Ambient waste from environment (constant small amount)
  effects.push({
    tier: 'passive',
    resource: 'waste',
    delta: state.environment.ambientWaste,
    source: 'environment',
  });

  return effects;
}

// Export for testing
export { getTemperatureFactor, calculateDecay };
```

### 3. Feed Action Handler (`src/simulation/actions.ts`)

Update existing file to handle feed action:

```typescript
export function executeAction(state: SimulationState, action: Action): Effect[] {
  switch (action.type) {
    case 'topOff':
      return executeTopOffAction(state);
    case 'feed':
      return executeFeedAction(state, action);
    default:
      return [];
  }
}

function executeFeedAction(state: SimulationState, action: FeedAction): Effect[] {
  return [
    {
      tier: 'immediate',
      resource: 'food',
      delta: action.amount,
      source: 'user_action',
    },
  ];
}
```

### 4. Tick Integration (`src/simulation/tick.ts`)

Update to collect decay effects in PASSIVE tier:

```typescript
import { collectDecayEffects } from './core/decay.js';

export function runTick(state: SimulationState): SimulationState {
  return produce(state, draft => {
    draft.tick++;

    // Calculate passive resources (used by systems)
    draft.passiveResources = calculatePassiveResources(draft);

    // === TIER 1: IMMEDIATE ===
    const immediateEffects = [
      ...collectEnvironmentEffects(draft),
      ...collectEquipmentEffects(draft, 'immediate'),
    ];
    applyEffects(draft, immediateEffects);

    // === TIER 2: ACTIVE ===
    // (Plants and livestock - not yet implemented)
    const activeEffects: Effect[] = [];
    applyEffects(draft, activeEffects);

    // === TIER 3: PASSIVE ===
    const passiveEffects = [
      ...collectDecayEffects(draft), // NEW
      // ...collectNitrogenCycleEffects(draft), // Future
      // ...collectGasExchangeEffects(draft), // Future
    ];
    applyEffects(draft, passiveEffects);
  });
}
```

### 5. UI - Livestock Panel (`src/ui/components/panels/Livestock.tsx`)

Add food indicator:

```typescript
import React from 'react';
import { Panel } from '../layout/Panel';

interface LivestockProps {
  food: number;
}

function getFoodIndicatorColor(food: number): string {
  // No food = transparent/gray
  if (food === 0) return 'bg-gray-600';

  // Calculate opacity/intensity based on food amount
  // 0.5g = light orange, 2g+ = full orange
  const intensity = Math.min(food / 2.0, 1.0);
  const opacity = 0.3 + (intensity * 0.7); // 0.3 to 1.0

  return `bg-orange-500`;
}

function getFoodIndicatorOpacity(food: number): number {
  if (food === 0) return 0.3;
  const intensity = Math.min(food / 2.0, 1.0);
  return 0.3 + (intensity * 0.7); // 0.3 to 1.0
}

export function Livestock({ food }: LivestockProps): React.JSX.Element {
  const color = getFoodIndicatorColor(food);
  const opacity = getFoodIndicatorOpacity(food);

  return (
    <Panel title="Livestock">
      <div className="space-y-3">
        {/* Food indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Food available</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${color}`}
              style={{ opacity }}
              title={`${food.toFixed(2)}g food`}
            />
            <span className="text-xs text-gray-400">{food.toFixed(1)}g</span>
          </div>
        </div>

        <div className="text-xs text-gray-400 italic">
          No livestock yet...
        </div>
      </div>
    </Panel>
  );
}
```

### 6. UI - Water Chemistry Panel (`src/ui/components/panels/WaterChemistry.tsx`)

Add waste display:

```typescript
import React from 'react';
import { Panel } from '../layout/Panel';

interface WaterChemistryProps {
  waste: number;
}

export function WaterChemistry({ waste }: WaterChemistryProps): React.JSX.Element {
  return (
    <Panel title="Water Chemistry">
      <div className="space-y-3">
        {/* Waste */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Waste</span>
          <span className="text-sm text-gray-200">{waste.toFixed(2)}g</span>
        </div>

        <div className="text-xs text-gray-400 italic">
          More parameters coming soon...
        </div>
      </div>
    </Panel>
  );
}
```

### 7. UI - Actions Panel (`src/ui/components/panels/Actions.tsx`)

Add Feed button with amount input:

```typescript
import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import type { Action } from '../../../simulation/index.js';

interface ActionsProps {
  waterLevel: number;
  capacity: number;
  executeAction: (action: Action) => void;
}

export function Actions({
  waterLevel,
  capacity,
  executeAction,
}: ActionsProps): React.JSX.Element {
  const [feedAmount, setFeedAmount] = useState(0.5);

  const handleTopOff = (): void => {
    executeAction({ type: 'topOff' });
  };

  const handleFeed = (): void => {
    executeAction({ type: 'feed', amount: feedAmount });
  };

  const isWaterFull = waterLevel >= capacity;

  return (
    <Panel title="Actions">
      <div className="space-y-3">
        {/* Feed */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-400">Amount (g)</label>
            <input
              type="number"
              value={feedAmount}
              onChange={(e) => setFeedAmount(parseFloat(e.target.value) || 0.1)}
              min="0.1"
              max="5.0"
              step="0.1"
              className="w-20 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded"
            />
          </div>
          <Button onClick={handleFeed} variant="primary">
            Feed Fish
          </Button>
        </div>

        {/* Top Off */}
        <Button
          onClick={handleTopOff}
          disabled={isWaterFull}
          variant="primary"
        >
          Top Off Water
        </Button>
      </div>
    </Panel>
  );
}
```

### 8. Logging

Add decay logging when significant:

```typescript
// In decay.ts, after calculating decay
if (decayAmount > 0.1) { // Only log significant decay (> 0.1g)
  // Logging handled by tick loop when effects applied
  // Could add a warning if excessive food decay
}

// In actions.ts for feed action
draft.logs.push(createLog(
  draft.tick,
  'user_action',
  'info',
  `Fed ${action.amount.toFixed(1)}g of food`
));
```

## File Structure

```
src/simulation/
  state.ts                          # Add food, waste, ambientWaste, FeedAction
  core/
    decay.ts                        # New: Decay system
    decay.test.ts                   # New: Tests
  actions.ts                        # Add feed action handler
  tick.ts                           # Integrate decay in PASSIVE tier

src/ui/components/panels/
  Livestock.tsx                     # Add food indicator (orange circle)
  WaterChemistry.tsx                # Add waste display
  Actions.tsx                       # Add Feed button with amount input
```

## Acceptance Criteria

- [ ] `food` resource on state (grams, 2 decimal precision, default 0)
- [ ] `waste` resource on state (grams, default 0)
- [ ] `ambientWaste` on environment (default 0.01 g/hour)
- [ ] `FeedAction` with `type: 'feed'` and `amount: number`
- [ ] `getTemperatureFactor()` calculates Q10 temperature scaling correctly
- [ ] `calculateDecay()` returns correct decay amount based on food and temperature
- [ ] Base decay rate is 5% per hour at 25°C
- [ ] Decay rate doubles at 35°C (Q10 = 2.0)
- [ ] Decay rate halves at 15°C (Q10 = 2.0)
- [ ] `collectDecayEffects()` creates food → waste effects in PASSIVE tier
- [ ] Ambient waste creates constant 0.01 g/hour waste effect
- [ ] Feed action adds food to tank
- [ ] Feed action logged with amount
- [ ] Decay effects applied each tick in PASSIVE tier
- [ ] Food decreases as it decays
- [ ] Waste increases from decay and ambient waste
- [ ] Can't decay more food than available
- [ ] UI Livestock panel shows food indicator (orange circle with opacity based on amount)
- [ ] UI Livestock panel shows food amount in grams
- [ ] UI WaterChemistry panel shows waste amount
- [ ] UI Actions panel has Feed button with amount input (0.1-5.0g, step 0.1)
- [ ] Default feed amount is 0.5g
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// decay.test.ts
describe('Decay system', () => {
  describe('getTemperatureFactor', () => {
    - at 25°C (reference) returns 1.0
    - at 35°C returns 2.0 (Q10 = 2)
    - at 15°C returns 0.5 (Q10 = 2)
    - at 30°C returns ~1.41
    - at 20°C returns ~0.71
  });

  describe('calculateDecay', () => {
    - returns 0 when food is 0
    - at 25°C with 1g food returns 0.05g (5%)
    - at 30°C with 1g food returns ~0.07g (faster)
    - at 20°C with 1g food returns ~0.035g (slower)
    - never decays more than available food
    - very small food amounts decay correctly
  });

  describe('collectDecayEffects', () => {
    - creates negative food effect when food > 0
    - creates positive waste effect equal to decay amount
    - creates ambient waste effect (0.01 g/hour)
    - creates no food effect when food is 0
    - both effects have tier: 'passive'
    - decay source is 'decay'
    - ambient source is 'environment'
  });
});

// actions.test.ts (updated)
describe('Feed action', () => {
  - creates positive food effect with specified amount
  - effect has tier: 'immediate'
  - effect source is 'user_action'
  - handles different amounts (0.1g, 0.5g, 2.0g)
  - logged with correct message
});

// Integration tests
describe('Food-Decay-Waste integration', () => {
  - feeding increases food resource
  - food decays to waste over time
  - waste accumulates from decay
  - ambient waste accumulates continuously
  - higher temperature increases decay rate
  - lower temperature decreases decay rate
  - all food eventually decays if no consumption
  - decay happens in PASSIVE tier (after IMMEDIATE and ACTIVE)
});
```

## Notes

- **Food precision**: 2 decimals allows accurate 0.25g portions
- **Waste is abstract**: Represents all organic matter, not just food
- **Temperature matters**: Q10 = 2 means tropical tanks (warmer) decay faster
- **Ambient waste seeds bacteria**: 0.01 g/hour = 0.24g/day allows nitrogen cycle testing without fish
- **PASSIVE tier**: Decay runs after equipment and organisms (future)
- **No livestock yet**: Food just decays, will be consumed by fish in future task
- **No nitrogen cycle yet**: Waste accumulates, will convert to ammonia in future task
- **Base decay rate (5%/hour)**: ~77% decays in 24 hours at 25°C, ~95% in 48 hours
- **Temperature scaling realistic**: Based on biological Q10 coefficient
- **UI food indicator**: Visual feedback for food availability, useful when fish are added
- **UI waste tracking**: Important for understanding nitrogen cycle inputs (future)
- **Feed amount input**: Allows realistic feeding (0.5g typical, up to 5g for large tanks)
- **Overfeeding**: User can overfeed, will cause problems when nitrogen cycle implemented
- **Logging**: Feed actions always logged, decay only logged if significant (reduces noise)
- This task sets up the organic matter pipeline: Food → Waste → (future: Ammonia → Nitrite → Nitrate)

# Task 01: Foundation

**Status:** completed

## Overview

Bootstrap the simulation engine with core infrastructure: state management, tick loop, and effect system. This creates the skeleton that all future systems plug into.

## Scope

### In Scope
- Simulation state types and factory
- Minimal resource map (water volume + temperature only)
- Effect type definitions and three-tier processing
- Tick function that advances time and processes effects
- Immer for immutable updates

### Out of Scope
- Any actual systems (evaporation, heating, etc.)
- Equipment, plants, livestock
- Environment configuration
- Logging system
- CLI or UI

## Implementation

### 1. State (`src/simulation/state.ts`)

```typescript
interface SimulationState {
  tick: number;
  tank: {
    capacity: number;      // liters (max volume)
    waterLevel: number;    // liters (current volume)
  };
  resources: {
    temperature: number;   // °C
  };
}
```

- `createSimulation(config)` - Factory function to create initial state
- Config takes tank capacity and initial temperature (water level always starts full)

### 2. Effects (`src/simulation/effects.ts`)

```typescript
type EffectTier = 'immediate' | 'active' | 'passive';

interface Effect {
  tier: EffectTier;
  resource: string;        // resource key
  delta: number;           // change amount
  source: string;          // what produced this effect
}
```

- `applyEffects(state, effects)` - Apply effects to state, returns new state
- Clamp values appropriately (water can't exceed capacity, can't go negative, etc.)
- Use Immer's `produce()` for immutable updates

### 3. Tick (`src/simulation/tick.ts`)

```typescript
function tick(state: SimulationState): SimulationState
```

- Increment tick counter
- Process effects in order: immediate → active → passive
- For now, no systems produce effects (empty arrays)
- Returns new state object

### 4. Project Setup

- Initialize npm project with TypeScript
- Add Vitest for testing
- Add Immer for immutable state
- Configure `tsconfig.json` for strict mode
- Add npm scripts: `test`, `build`, `lint`

## File Structure

```
src/
  simulation/
    state.ts        # SimulationState type, createSimulation()
    effects.ts      # Effect type, applyEffects()
    tick.ts         # tick() function
    index.ts        # Public exports
  index.ts          # Package entry point
```

## Acceptance Criteria

- [x] `createSimulation()` returns valid initial state
- [x] `tick()` increments tick counter and returns new state object
- [x] `applyEffects()` correctly modifies resources
- [x] Effects are clamped (no negative water, no overflow)
- [x] State is immutable (original state unchanged after tick)
- [x] All tests pass with >90% coverage (100% achieved)
- [x] `npm run build` succeeds
- [x] `npm run lint` passes

## Tests

```typescript
// state.test.ts
- creates simulation with default values
- creates simulation with custom config
- initial tick is 0

// effects.test.ts
- applies single effect
- applies multiple effects
- clamps water level to capacity
- clamps water level to zero minimum
- clamps temperature to reasonable bounds
- does not mutate original state

// tick.test.ts
- increments tick counter
- returns new state object (immutability)
- processes effects in tier order
```

## Notes

- Keep it minimal - resist adding "nice to haves"
- The effect system will be extended later to support more resource types
- Temperature bounds: 0-50°C reasonable for aquarium simulation

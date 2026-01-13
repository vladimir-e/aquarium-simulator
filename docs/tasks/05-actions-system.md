# Task 05: Actions System

**Status:** pending

## Overview

Implement user intervention actions that directly modify aquarium state. Actions provide immediate response to user input (even when paused) while maintaining immutability and full logging. Start with Top Off action as foundation, with architecture to support all future actions.

## References

- [8-ACTIONS.md](../8-ACTIONS.md) - Actions specification

## Scope

### In Scope

- Actions infrastructure (types, application function)
- Manual action execution (immediate, bypasses tick loop)
- Top Off action (restore water to 100% capacity)
- Actions panel UI with Top Off button
- Action logging (all actions emit logs)
- Unit tests for actions infrastructure

### Out of Scope

- Automated actions (auto-feeder, scheduled maintenance)
- Other manual actions (Feed, Clean, Water Change, Dose, Scrub, Trim, Sell Fry)
- Action history/undo
- Action scheduling UI
- Action confirmation dialogs
- Action parameters/configuration (Top Off is single-click)

## Architecture

### Manual vs Automated Actions

**Manual actions** (user clicks button):
- Apply immediately via `applyAction()` function
- Work even when simulation is paused
- Direct state manipulation with Immer
- Logged immediately
- UX: responsive, no waiting for tick

**Automated actions** (future):
- Apply during tick processing (IMMEDIATE tier)
- Go through effect system
- Examples: auto-feeder, scheduled maintenance

### Design Principles

1. **Immediate feedback:** Manual actions don't wait for next tick
2. **Immutability:** Use `produce()` for all state changes
3. **Full logging:** Every action emits a log entry
4. **Type safety:** Strong typing for action types and payloads
5. **Separation:** Actions are distinct from simulation systems

## Implementation

### 1. Action Types (`src/simulation/actions/types.ts`)

```typescript
import type { SimulationState } from '../state.js';

export type ActionType = 'topOff';

export interface BaseAction {
  type: ActionType;
}

export interface TopOffAction extends BaseAction {
  type: 'topOff';
  // No parameters - always fills to capacity
}

export type Action = TopOffAction;

/**
 * Result of applying an action to simulation state.
 */
export interface ActionResult {
  /** Updated simulation state */
  state: SimulationState;
  /** Human-readable message describing what happened */
  message: string;
}
```

### 2. Top Off Action (`src/simulation/actions/top-off.ts`)

```typescript
import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../logging.js';
import type { ActionResult } from './types.js';

/**
 * Top Off: Restore water level to tank capacity.
 * Simulates adding fresh water to replace evaporated water.
 */
export function topOff(state: SimulationState): ActionResult {
  const { waterLevel, capacity } = state.tank;

  // Already at capacity, no action needed
  if (waterLevel >= capacity) {
    return {
      state,
      message: `Water already at capacity (${capacity}L)`,
    };
  }

  const amountAdded = capacity - waterLevel;

  const newState = produce(state, (draft) => {
    draft.tank.waterLevel = draft.tank.capacity;
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Topped off water: +${amountAdded.toFixed(1)}L to ${capacity}L`
      )
    );
  });

  return {
    state: newState,
    message: `Added ${amountAdded.toFixed(1)}L`,
  };
}
```

### 3. Actions Registry (`src/simulation/actions/index.ts`)

```typescript
import type { SimulationState } from '../state.js';
import type { Action, ActionResult } from './types.js';
import { topOff } from './top-off.js';

export * from './types.js';
export * from './top-off.js';

/**
 * Apply a user action to the simulation state.
 * Actions are applied immediately (do not wait for tick).
 * Returns new state and result message.
 */
export function applyAction(
  state: SimulationState,
  action: Action
): ActionResult {
  switch (action.type) {
    case 'topOff':
      return topOff(state);
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${(_exhaustive as Action).type}`);
  }
}
```

### 4. Simulation Hook Updates (`src/ui/hooks/useSimulation.ts`)

Add action dispatch function:

```typescript
import { applyAction, type Action } from '../../simulation/actions/index.js';

export function useSimulation() {
  const [state, setState] = useState<SimulationState>(() =>
    createSimulation({ tankCapacity: 75 })
  );

  // ... existing tick, reset, config functions ...

  /**
   * Execute a user action immediately (works even when paused).
   */
  const executeAction = useCallback((action: Action) => {
    setState((currentState) => {
      const result = applyAction(currentState, action);
      return result.state;
    });
  }, []);

  return {
    state,
    tick,
    reset,
    // ... existing functions ...
    executeAction,
  };
}
```

### 5. Actions Panel UI (`src/ui/components/panels/Actions.tsx`)

```tsx
import React from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { useSimulation } from '../../hooks/useSimulation';

export function Actions(): React.JSX.Element {
  const { state, executeAction } = useSimulation();

  const handleTopOff = () => {
    executeAction({ type: 'topOff' });
  };

  const isWaterFull = state.tank.waterLevel >= state.tank.capacity;

  return (
    <Panel title="Actions">
      <div className="space-y-2">
        <Button
          onClick={handleTopOff}
          disabled={isWaterFull}
          variant="primary"
          size="sm"
        >
          Top Off Water
        </Button>
        {isWaterFull && (
          <div className="text-xs text-gray-400">
            Water level at capacity
          </div>
        )}
      </div>
    </Panel>
  );
}
```

**UX Details:**
- Button disabled when water already at capacity
- Shows feedback message when disabled
- Action executes immediately on click (no confirmation)
- Works when simulation is paused

## File Structure

```
src/simulation/
  actions/               # NEW: Actions system
    types.ts            # Action type definitions
    top-off.ts          # Top Off action implementation
    index.ts            # Actions registry, applyAction()
  index.ts              # Export actions types

src/ui/
  components/
    panels/
      Actions.tsx       # Update with Top Off button
  hooks/
    useSimulation.ts    # Add executeAction()
```

## Acceptance Criteria

- [ ] `Action` type union defined with `topOff`
- [ ] `ActionResult` interface for action results
- [ ] `topOff()` function implemented
- [ ] `applyAction()` dispatcher with exhaustiveness check
- [ ] Top Off restores water level to capacity
- [ ] Top Off emits log entry with amount added
- [ ] Top Off returns message describing result
- [ ] Top Off is idempotent (safe when already full)
- [ ] `executeAction()` added to useSimulation hook
- [ ] Actions panel has Top Off button
- [ ] Button disabled when water at capacity
- [ ] Action works when simulation is paused
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// actions/top-off.test.ts
- adds water to reach capacity when below
- returns correct amount added in message
- emits log entry with amount and final level
- is idempotent when already at capacity
- preserves other state properties (temperature, etc.)
- does not modify original state (immutability)

// actions/index.test.ts
- applyAction dispatches to correct handler
- throws error for unknown action type
- returns ActionResult with state and message

// useSimulation.test.ts (integration)
- executeAction applies action to state
- executeAction works when simulation is paused
- top off increases water level to capacity
- top off action appears in logs
- multiple actions can be executed
```

## Future Actions

This architecture supports adding more actions:

**Next actions to implement:**
1. **Feed** - Add food to tank (requires food resource)
2. **Water Change** - Remove/replace water % (requires dilution system)
3. **Dose** - Add nutrients (requires nutrients resource)
4. **Clean Substrate** - Remove waste (requires waste resource)
5. **Scrub Algae** - Remove algae (requires algae resource)
6. **Trim Plants** - Remove plant biomass (requires plants)
7. **Sell Fry** - Remove fry population (requires livestock)

**Automated actions** (future tasks):
- Auto-feeder: Scheduled feeding during tick (IMMEDIATE tier)
- Maintenance service: Complex multi-action with configuration

## Notes

- Top Off is the simplest action (no parameters, no side effects)
- Actions bypass tick loop for immediate UX
- All actions maintain immutability via `produce()`
- Actions always log what they did
- Future: Add toast notifications for action feedback
- Future: Add confirmation dialogs for destructive actions
- Future: Add action history/undo system
- Dilution effects (concentration changes) will be handled by Dilution core system when water volume changes

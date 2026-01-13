# Task 04: Logging System

**Status:** pending

## Overview

Build a logging system to capture simulation events for investigation and debugging. Logs help users understand what happened during a simulation run - configuration changes and resource warnings.

## References

- [9-LOGGING.md](../9-LOGGING.md) - Event logging system specs

## Scope

### In Scope

- Logging infrastructure (event collection, in-memory storage)
- Severity levels: INFO, WARNING
- Alerts system (modular warning checks after effects applied)
- Water level critical alert (< 20% capacity)
- Events emitted from UI hooks (user configuration changes)
- Basic Log panel UI to display events
- Unit tests for logging infrastructure and alerts

### Out of Scope

- Log filtering/search
- Log export to file
- Log persistence (localStorage)
- Performance optimization (virtual scrolling, pagination)
- Structured data attachments beyond message string
- Categories/tags (source field serves this purpose)

## Event Inventory

### Configuration Changes (INFO)

Events emitted when user changes simulation configuration:

| Event | Source | Trigger | Message Format |
|-------|--------|---------|----------------|
| Simulation created | `simulation` | `createSimulation()` | `"Simulation created: {capacity}L tank, {roomTemp}°C room, heater {enabled/disabled}"` |
| Simulation reset | `simulation` | `reset()` | `"Simulation reset to {capacity}L tank"` |
| Tank capacity changed | `user` | `changeTankCapacity()` | `"Tank capacity changed: {oldCapacity}L → {newCapacity}L"` |
| Heater enabled | `user` | `updateHeaterEnabled(true)` | `"Heater enabled (target: {targetTemp}°C, {wattage}W)"` |
| Heater disabled | `user` | `updateHeaterEnabled(false)` | `"Heater disabled"` |
| Heater target changed | `user` | `updateHeaterTargetTemperature()` | `"Heater target: {oldTemp}°C → {newTemp}°C"` |
| Heater wattage changed | `user` | `updateHeaterWattage()` | `"Heater wattage: {oldWattage}W → {newWattage}W"` |
| Room temperature changed | `user` | `updateRoomTemperature()` | `"Room temperature: {oldTemp}°C → {newTemp}°C"` |

### Resource Warnings (WARNING)

Events emitted when simulation reaches resource limits:

| Event | Source | Trigger | Message Format |
|-------|--------|---------|----------------|
| Water level critical | `evaporation` | Water level < 20% of capacity | `"Water level critical: {level}L ({percent}% of capacity)"` |

## Architecture

### Log Entry Structure

```typescript
type LogSeverity = 'info' | 'warning';

interface LogEntry {
  tick: number;        // Simulation tick when event occurred
  source: string;      // System/component emitting event (e.g., 'user', 'heater', 'evaporation')
  severity: LogSeverity;
  message: string;     // Human-readable description
}
```

### State Extension

```typescript
interface SimulationState {
  tick: number;
  tank: Tank;
  resources: Resources;
  environment: Environment;
  equipment: Equipment;
  logs: LogEntry[];    // In-memory log storage
}
```

### Logging API

```typescript
// Log creation helper
function createLog(
  state: SimulationState,
  source: string,
  severity: LogSeverity,
  message: string
): LogEntry {
  return {
    tick: state.tick,
    source,
    severity,
    message,
  };
}

// Add log to state (using Immer in tick loop)
function addLog(state: SimulationState, log: LogEntry): void {
  state.logs.push(log);
}
```

## Implementation

### 1. State Updates (`src/simulation/state.ts`)

- Add `LogEntry` interface
- Add `LogSeverity` type
- Extend `SimulationState` with `logs: LogEntry[]`
- Initialize `logs` as empty array in `createSimulation()`
- Emit "Simulation created" log on initialization

### 2. Logging Utilities (`src/simulation/logging.ts`)

```typescript
export type LogSeverity = 'info' | 'warning';

export interface LogEntry {
  tick: number;
  source: string;
  severity: LogSeverity;
  message: string;
}

export function createLog(
  state: SimulationState,
  source: string,
  severity: LogSeverity,
  message: string
): LogEntry {
  return {
    tick: state.tick,
    source,
    severity,
    message,
  };
}
```

### 3. Alerts System (`src/simulation/alerts/`)

Create a modular alerts system that checks for warning conditions after effects are applied.

**Alert Interface** (`src/simulation/alerts/types.ts`):

```typescript
export interface Alert {
  /** Unique identifier for this alert */
  id: string;
  /** Check for alert condition and return log entry if triggered */
  check(state: SimulationState): LogEntry | null;
}
```

**Water Level Alert** (`src/simulation/alerts/water-level.ts`):

```typescript
import { Alert } from './types';
import { LogEntry } from '../logging';
import { SimulationState } from '../state';
import { createLog } from '../logging';

export const waterLevelAlert: Alert = {
  id: 'water-level-critical',

  check(state: SimulationState): LogEntry | null {
    const { waterLevel, capacity } = state.tank;

    // Alert when water level drops below 20% capacity
    if (waterLevel > 0 && waterLevel / capacity < 0.2) {
      const percent = ((waterLevel / capacity) * 100).toFixed(1);
      return createLog(
        state,
        'evaporation',
        'warning',
        `Water level critical: ${waterLevel.toFixed(1)}L (${percent}% of capacity)`
      );
    }

    return null;
  }
};
```

**Alerts Registry** (`src/simulation/alerts/index.ts`):

```typescript
import { Alert } from './types';
import { waterLevelAlert } from './water-level';

export * from './types';
export * from './water-level';

/** All alerts checked after effects are applied */
export const alerts: Alert[] = [
  waterLevelAlert,
  // Future alerts will be added here
];

/** Check all alerts and return triggered log entries */
export function checkAlerts(state: SimulationState): LogEntry[] {
  return alerts
    .map(alert => alert.check(state))
    .filter((log): log is LogEntry => log !== null);
}
```

### 4. Tick Integration (`src/simulation/tick.ts`)

Add alerts phase after all effects are applied:

```typescript
import { checkAlerts } from './alerts';

export function tick(state: SimulationState): SimulationState {
  return produce(state, (draft) => {
    draft.tick += 1;

    // 1. Collect and apply effects (existing)
    const immediateEffects = collectImmediateEffects(draft);
    applyEffects(draft, immediateEffects);

    const activeEffects = collectActiveEffects(draft);
    applyEffects(draft, activeEffects);

    const passiveEffects = collectPassiveEffects(draft);
    applyEffects(draft, passiveEffects);

    // 2. Check alerts after all effects applied (NEW)
    const alertLogs = checkAlerts(draft);
    draft.logs.push(...alertLogs);
  });
}
```

### 5. UI Hook Updates (`src/ui/hooks/useSimulation.ts`)

Add logs for all user configuration changes:

```typescript
// In changeTankCapacity()
const oldCapacity = state.tank.capacity;
const log = createLog(state, 'user', 'info',
  `Tank capacity changed: ${oldCapacity}L → ${capacity}L`);
newState.logs.push(log);

// In updateHeaterEnabled()
const message = enabled
  ? `Heater enabled (target: ${state.equipment.heater.targetTemperature}°C, ${state.equipment.heater.wattage}W)`
  : 'Heater disabled';
const log = createLog(state, 'user', 'info', message);
newState.logs.push(log);

// Similar for other user actions...
```

### 6. Log Panel UI (`src/ui/components/panels/Log.tsx`)

Display logs in reverse chronological order (newest first):

```tsx
export function Log(): React.JSX.Element {
  const { state } = useSimulation();
  const logs = state.logs;

  return (
    <Panel title="Log">
      <div className="space-y-1">
        {logs.length === 0 && (
          <div className="text-xs text-gray-400">No events yet</div>
        )}

        {logs.slice().reverse().map((log, index) => (
          <div
            key={`${log.tick}-${index}`}
            className="text-xs font-mono"
          >
            <span className="text-gray-500">
              Tick {log.tick}
            </span>
            {' '}
            <span className={
              log.severity === 'warning'
                ? 'text-yellow-400'
                : 'text-blue-400'
            }>
              [{log.source}]
            </span>
            {' '}
            <span className={
              log.severity === 'warning'
                ? 'text-yellow-300'
                : 'text-gray-300'
            }>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

**Visual design:**
- Monospace font for structured look
- Color-coded severity: blue (info), yellow (warning)
- Format: `Tick {tick} [source] message`
- Reverse chronological order (newest at top)
- Auto-scroll to bottom on new entries (future enhancement)

## File Structure

```
src/simulation/
  state.ts              # Add LogEntry, extend state with logs[]
  logging.ts            # NEW: LogEntry type, createLog helper
  alerts/               # NEW: Alerts system
    types.ts            # Alert interface
    water-level.ts      # Water level critical alert
    index.ts            # Alerts registry, checkAlerts()
  tick.ts               # Integrate alerts phase
  index.ts              # Export logging and alerts types

src/ui/
  components/
    panels/
      Log.tsx           # Update to display logs
  hooks/
    useSimulation.ts    # Add logs for user actions
```

## Acceptance Criteria

- [ ] `LogEntry` interface defined with tick, source, severity, message
- [ ] `LogSeverity` type: 'info' | 'warning'
- [ ] `logs` array added to `SimulationState`
- [ ] `Alert` interface defined with id and check method
- [ ] Alerts registry with `checkAlerts()` function
- [ ] Water level alert implemented (< 20% capacity)
- [ ] Alerts phase integrated into tick loop (after effects applied)
- [ ] "Simulation created" log emitted on initialization
- [ ] "Simulation reset" log emitted on reset
- [ ] User configuration changes emit INFO logs (8 events total)
- [ ] Log panel displays logs in reverse chronological order
- [ ] Logs are color-coded by severity
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// logging.test.ts
- creates log entry with correct structure
- includes current tick in log entry
- sets correct severity level

// alerts/types.test.ts
- Alert interface is properly typed

// alerts/water-level.test.ts
- returns warning log when water level < 20% capacity
- returns null when water level >= 20% capacity
- returns null when water level is 0 (tank empty)
- log message includes current water level and percentage
- log has correct severity (warning) and source (evaporation)

// alerts/index.test.ts
- checkAlerts returns array of triggered alerts
- checkAlerts filters out null results
- checkAlerts works with multiple alerts

// tick.test.ts (integration)
- calls checkAlerts after applying effects
- adds alert logs to state.logs
- alerts run after passive effects tier

// state.test.ts
- initializes with empty logs array
- emits "Simulation created" log on initialization

// useSimulation.test.ts (integration)
- emits log when tank capacity changed
- emits log when heater enabled
- emits log when heater disabled
- emits log when heater target changed
- emits log when heater wattage changed
- emits log when room temperature changed
- logs accumulate across multiple ticks
- water level alert triggered when evaporation drops below 20%
```

## Notes

- Logs stored in-memory only (no persistence)
- No log size limits for MVP (assume reasonable simulation length)
- User actions logged in UI hooks (where state mutations happen)
- Alerts system provides clean separation of concerns from effects
- Alerts run after all effect tiers are applied each tick
- Alert pattern mirrors system/equipment pattern for consistency
- No clamping logs to avoid spam (values visible in UI)
- Future alerts: temperature extremes, oxygen low, ammonia high, etc.
- Future: Add log export, filtering, search capabilities

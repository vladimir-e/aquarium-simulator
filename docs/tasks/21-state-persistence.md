# Task 21: State Persistence

**Status:** completed

## Overview

Implement a centralized persistence system that saves and restores the entire application state between page reloads. This includes simulation state (equipment, resources, plants, tick), tunable config, UI preferences (units, debug panel), and provides bulletproof error recovery.

## References

- `src/ui/hooks/useConfig.tsx` - Current TunableConfig persistence (to be replaced)
- `src/ui/hooks/useUnits.tsx` - Current units persistence (to be replaced)
- `src/ui/hooks/useSimulation.ts` - Simulation state and reset logic
- `src/simulation/state.ts` - SimulationState type definition

## Scope

### In Scope

1. **PersistenceProvider** - Single provider wrapping the app that manages all localStorage persistence
2. **SimulationState persistence** - Save/restore equipment, resources, plants, tick, environment, alertState
3. **Replace existing persistence** - Remove old localStorage code from useConfig and useUnits
4. **Single localStorage key** - `aquarium-state` with versioned schema
5. **Error-proof loading** - Graceful degradation when stored data is invalid or corrupted
6. **Hard reset URL** - `?reset` query parameter clears all localStorage and redirects
7. **Emergency recovery UI** - noscript fallback link to reset URL
8. **Reset buttons** - Multiple reset scopes with appropriate confirmations

### Out of Scope

- Save/load via file upload/download (future feature)
- Multiple save slots
- Undo/redo history persistence
- Cloud sync
- Backward compatibility with old localStorage keys

## Implementation

### 1. Storage Schema

Single localStorage key with versioned structure:

```typescript
interface PersistedState {
  version: number;

  simulation: {
    tick: number;
    tank: Tank;
    resources: Resources;
    environment: Environment;
    equipment: Equipment;
    plants: Plant[];
    alertState: AlertState;
  };

  tunableConfig: TunableConfig;

  ui: {
    units: 'metric' | 'imperial';
    debugPanelOpen: boolean;
  };
}
```

Storage key: `aquarium-state`

### 2. File Structure

```
src/ui/persistence/
├── index.ts           # Re-exports
├── types.ts           # PersistedState type
├── schema.ts          # Zod validation schema
├── storage.ts         # localStorage read/write with validation
└── PersistenceProvider.tsx  # React context provider
```

**Key design decisions:**

1. **Zod validation** - Validate entire stored structure before applying. Invalid sections fall back to defaults.

2. **Section-level recovery** - If `simulation` section is corrupted but `tunableConfig` is valid, use defaults for simulation but preserve config.

3. **Debounced auto-save** - Save 500ms after any state change.

4. **Version handling** - On version mismatch, discard stored data and use defaults.

### 3. Provider Hierarchy

```tsx
// main.tsx
<PersistenceProvider>
  <ConfigProvider>
    <UnitsProvider>
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </UnitsProvider>
  </ConfigProvider>
</PersistenceProvider>
```

Each child provider reads its initial state from PersistenceProvider context and notifies on changes for persistence.

### 4. Hard Reset Mechanism

**Query parameter handler in main.tsx:**

```typescript
if (window.location.search.includes('reset')) {
  localStorage.removeItem('aquarium-state');
  window.location.href = window.location.pathname;
}
```

**Emergency recovery in index.html:**

```html
<noscript>
  <div style="padding: 20px; font-family: system-ui; text-align: center;">
    <p>JavaScript is required to run this application.</p>
    <p>If the page is broken, <a href="?reset">click here to reset</a>.</p>
  </div>
</noscript>
```

**Error boundary behavior:**
1. Catch render error
2. Clear persisted state
3. Attempt to render app with defaults
4. If that also fails, show error UI with reset link

### 5. Loading Strategy

**On app load:**

1. Check for `?reset` - if present, clear storage and redirect
2. Read `aquarium-state` from localStorage
3. Parse JSON, validate with Zod schema
4. If version mismatch or validation fails: discard and use defaults
5. For each section (simulation, tunableConfig, ui):
   - If valid: use stored value
   - If invalid: use defaults, log warning to console
6. Merge with defaults to handle new fields added in code

**Logs are ephemeral:** When loading persisted simulation state, always set `logs: []`.

### 6. Reset Buttons

Three separate reset actions with different scopes:

| Reset Action | Location | Scope | Confirmation |
|-------------|----------|-------|--------------|
| Reset Simulation | Timeline (existing) | Clears simulation state, keeps equipment/plants at current values but resets resources/tick to fresh state | Confirm if tick > 720 (30 days) |
| Reset to Preset | New icon button next to preset dropdown | Reloads preset config, resets everything to preset defaults | Always confirm |
| Reset Tunable Config | Debug panel "Reset All" | Clears tunable config overrides | No confirmation |

**Reset Simulation** keeps the user's tank setup (equipment, plants) but resets:
- tick → 0
- resources → initial values for current tank capacity
- alertState → all false
- logs → empty

**Reset to Preset** reinitializes everything from the selected preset, same as switching presets. Add confirmation dialog for both preset switch and this reset button.

### 7. Refactoring Existing Code

**useConfig.tsx:**
- Remove localStorage read/write logic
- Accept initial tunableConfig from PersistenceProvider context
- Notify PersistenceProvider on config changes

**useUnits.tsx:**
- Remove localStorage read/write logic
- Accept initial units from PersistenceProvider context
- Notify PersistenceProvider on unit changes

**useSimulation.ts:**
- Accept initial simulation state from PersistenceProvider context (or null to use preset)
- Notify PersistenceProvider on state changes
- Update reset logic per section 6

### 8. Validation Schema (Zod)

Create strict schemas for each section:

```typescript
const ResourcesSchema = z.object({
  water: z.number().min(0),
  temperature: z.number().min(0).max(50),
  // ... all resource fields with reasonable bounds
}).strict();

const SimulationSchema = z.object({
  tick: z.number().int().min(0),
  tank: TankSchema,
  resources: ResourcesSchema,
  // ...
}).strict();

const PersistedStateSchema = z.object({
  version: z.number().int(),
  simulation: SimulationSchema,
  tunableConfig: TunableConfigSchema,
  ui: UiSchema,
}).strict();
```

Use `.strict()` to reject unknown keys.

## Acceptance Criteria

1. Page reload preserves complete simulation state (tick, resources, equipment, plants)
2. Page reload preserves tunable config overrides
3. Page reload preserves unit preference
4. Logs are NOT persisted (start fresh each session)
5. Visiting `?reset` clears all persisted state and redirects to clean URL
6. Corrupted localStorage gracefully falls back to defaults without crashing
7. Reset Simulation button resets tick/resources, confirms if > 30 days
8. Reset to Preset button (new) resets to preset with confirmation
9. Preset switch shows confirmation dialog
10. Error boundary attempts recovery with defaults before showing error UI

## Tests

1. **storage.ts** - Unit tests for load/save/validate functions
2. **schema.ts** - Unit tests for Zod validation with valid/invalid inputs
3. **PersistenceProvider** - Integration tests for load/save lifecycle
4. **Reset flow** - Test that `?reset` clears storage
5. **Graceful degradation** - Test with various corrupted storage states
6. **Confirmation dialogs** - Test reset/preset switch confirmations

## Notes

- **Install Zod** - `npm install zod` (not currently in package.json)
- Consider localStorage quota limits (~5MB) - simulation state should be well under this
- Future: save/load via file will export the same `PersistedState` structure as JSON
- Old localStorage keys (`aquarium-tunable-config`, `aquarium-units`, `aquarium-debug-panel-open`) will be orphaned - users can clear them manually or ignore

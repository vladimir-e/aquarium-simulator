# Task 21: State Persistence

**Status:** completed

## Overview

Implement a centralized persistence system that saves and restores the entire application state between page reloads. This includes simulation state (equipment, resources, plants, tick), tunable config, UI preferences (units, debug panel), and provides bulletproof error recovery.

## References

- `src/ui/hooks/useConfig.tsx` - Current TunableConfig persistence (pattern to follow)
- `src/ui/hooks/useUnits.tsx` - Current units persistence
- `src/ui/hooks/useSimulation.ts` - Simulation state and reset logic
- `src/simulation/state.ts` - SimulationState type definition

## Scope

### In Scope

1. **Unified PersistenceProvider** - Single provider wrapping the app that manages all localStorage persistence
2. **SimulationState persistence** - Save/restore equipment, resources, plants, tick, environment, alertState
3. **Migrate existing persistence** - Move TunableConfig, units, and debug panel state into unified system
4. **Unified localStorage key** - Single `aquarium-state` key with versioned schema
5. **Error-proof loading** - Graceful degradation when stored data is invalid or corrupted
6. **Hard reset URL** - `?reset` query parameter clears all localStorage and redirects
7. **Emergency recovery UI** - noscript fallback link to reset URL
8. **Reset button integration** - Timeline reset clears persisted state

### Out of Scope

- Save/load via file upload/download (future feature)
- Multiple save slots
- Undo/redo history persistence
- Cloud sync

## Implementation

### 1. Storage Schema

Single localStorage key with versioned structure:

```typescript
interface PersistedState {
  version: number;  // Increment on breaking schema changes

  // Simulation state (without logs - they're ephemeral)
  simulation: {
    tick: number;
    tank: Tank;
    resources: Resources;
    environment: Environment;
    equipment: Equipment;
    plants: Plant[];
    alertState: AlertState;
  };

  // Tunable config (migrate from existing)
  tunableConfig: TunableConfig;

  // UI preferences
  ui: {
    units: 'metric' | 'imperial';
    debugPanelOpen: boolean;
    // Future: preset, speed, isPlaying could go here
  };
}
```

Storage key: `aquarium-state` (replaces `aquarium-tunable-config`, `aquarium-debug-panel-open`, `aquarium-units`)

### 2. PersistenceProvider Architecture

```
src/ui/persistence/
├── index.ts           # Re-exports
├── types.ts           # PersistedState type
├── schema.ts          # Zod validation schema
├── storage.ts         # localStorage read/write with validation
├── migrations.ts      # Version migration functions
└── PersistenceProvider.tsx  # React context provider
```

**Key design decisions:**

1. **Zod validation** - Validate entire stored structure before applying. Invalid sections fall back to defaults.

2. **Section-level recovery** - If `simulation` section is corrupted but `tunableConfig` is valid, use defaults for simulation but preserve config.

3. **Debounced auto-save** - Save 500ms after any state change (like current useConfig).

4. **Version migrations** - When version increments, run migration function instead of discarding. Fall back to discard if migration fails.

### 3. Provider Hierarchy

```tsx
// main.tsx - new structure
<PersistenceProvider>           {/* Loads/saves everything */}
  <ConfigProvider>              {/* Reads tunableConfig from persistence */}
    <UnitsProvider>             {/* Reads units from persistence */}
      <SimulationProvider>      {/* Reads simulation from persistence */}
        <App />
      </SimulationProvider>
    </UnitsProvider>
  </ConfigProvider>
</PersistenceProvider>
```

**Or simpler:** PersistenceProvider provides all state directly, eliminating separate providers. This is cleaner but requires more refactoring. Recommend the nested approach for minimal changes.

### 4. Hard Reset Mechanism

**Query parameter handler in main.tsx:**

```typescript
// Check for reset query param before React renders
if (window.location.search.includes('reset')) {
  localStorage.clear();  // Or just remove 'aquarium-state'
  window.location.href = window.location.pathname;  // Redirect to clean URL
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

Additionally, wrap App in an error boundary that catches render errors and shows the reset link.

### 5. Loading Strategy

**On app load:**

1. Check for `?reset` - if present, clear storage and redirect
2. Read `aquarium-state` from localStorage
3. Validate with Zod schema
4. If version mismatch: attempt migration, else discard
5. For each section (simulation, tunableConfig, ui):
   - If valid: use stored value
   - If invalid: use defaults, log warning
6. Merge with defaults to handle new fields added in code

**Wipe logs:** When loading persisted simulation state, always set `logs: []` (don't restore logs).

### 6. Reset Button Integration

The existing `reset` function in `useSimulation.ts` resets to preset defaults. Modify to also:

1. Clear persisted simulation state (but keep tunableConfig and UI preferences)
2. Or provide two reset modes: "Reset Simulation" vs "Reset All"

Recommend: Reset button clears simulation state from persistence. Debug panel's "Reset All" clears tunable config. No change to units on either reset.

### 7. Migration from Existing Keys

On first load after deployment:

1. Check for legacy keys (`aquarium-tunable-config`, `aquarium-units`, `aquarium-debug-panel-open`)
2. If found and new key doesn't exist: migrate to new format
3. Delete legacy keys after successful migration

### 8. Validation Schema (Zod)

Create strict schemas for each section. Example structure:

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

Use `.strict()` to reject unknown keys (prevents schema pollution).

## Acceptance Criteria

1. Page reload preserves complete simulation state (tick, resources, equipment, plants)
2. Page reload preserves tunable config overrides
3. Page reload preserves unit preference
4. Logs are NOT persisted (start fresh each session)
5. Visiting `?reset` clears all persisted state and redirects to clean URL
6. Corrupted localStorage gracefully falls back to defaults without crashing
7. Legacy localStorage keys are migrated and removed
8. Reset button in Timeline clears persisted simulation state
9. Error boundary shows emergency reset link if app crashes on load

## Tests

1. **storage.ts** - Unit tests for load/save/validate functions
2. **migrations.ts** - Unit tests for version migration
3. **PersistenceProvider** - Integration tests for load/save lifecycle
4. **Reset flow** - Test that `?reset` clears storage
5. **Graceful degradation** - Test with various corrupted storage states

## Notes

- **Install Zod** - `npm install zod` (not currently in package.json)
- Consider localStorage quota limits (~5MB) - simulation state should be well under this
- Future: save/load via file will export the same `PersistedState` structure as JSON

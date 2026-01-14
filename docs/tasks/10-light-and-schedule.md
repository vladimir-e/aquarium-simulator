# Task 10: Light Equipment and Schedule Module

**Status:** pending

## Overview

Implement Light equipment with photoperiod scheduling and a centralized Schedule module that can be reused by other time-based equipment (CO2, dosing, auto feeder). Light provides the passive "light" resource (watts) that drives plant photosynthesis and algae growth. When enabled, light follows its schedule automatically.

## References

- [3-EQUIPMENT.md](../3-EQUIPMENT.md) - Light specs (watts, schedule, photoperiod)
- [5-RESOURCES.md](../5-RESOURCES.md) - Light resource definition (passive resource)
- [6-PLANTS.md](../6-PLANTS.md) - Plants use light for photosynthesis (future task)
- [1-DESIGN.md](../1-DESIGN.md) - Time model (tick = 1 hour, hourOfDay = tick % 24)

## Scope

### In Scope

- **Schedule Module**: Centralized scheduling system with simple daily photoperiod
  - Daily repeat schedule (start hour 0-23, duration in hours)
  - `isActive(hourOfDay, schedule)` helper to check if equipment should be on
  - Reusable by Light, CO2, Auto Feeder, Dosing (future tasks)
- **Light Equipment**:
  - Wattage configuration (power output)
  - Enabled flag (user can disable entirely)
  - Schedule configuration (start hour, duration)
  - When enabled, always follows schedule
- **Passive Resource Integration**: Light adds to passive resources when schedule active
- **UI Component**: LightCard with schedule controls
  - Wattage selector (50W, 100W, 150W, 200W presets)
  - Schedule controls (start hour slider, duration slider)
  - Visual indicator showing current light state (on/off)
- **Logging**: Log when schedule changes

### Out of Scope

- **CO2 System**: Follows same schedule pattern but deferred to separate task
- **Auto Feeder / Dosing**: Different schedule patterns (interval-based, not photoperiod)
- **Multiple Light Fixtures**: Single light for now, array of lights is future enhancement
- **Advanced Schedules**:
  - Multiple on/off periods per day (siesta lighting)
  - Different schedules for different days of week
  - Gradual dimming/ramping (sunrise/sunset simulation)
- **Light Spectrum**: Color temperature, PAR values (simplified to watts only)
- **Plant/Algae Systems**: Light consumer logic deferred to future tasks
- **UI Timeline Visualization**: 24-hour timeline showing when lights are on (nice-to-have)

## Architecture

### Schedule Module

Create a reusable scheduling system in `src/simulation/schedule.ts`:

```typescript
/**
 * Daily photoperiod schedule - repeats every 24 hours
 */
export interface DailySchedule {
  /** Hour of day when equipment activates (0-23) */
  startHour: number;
  /** How many hours equipment stays on */
  duration: number;
}

/**
 * Check if equipment should be active based on current hour and schedule
 * @param hourOfDay - Current hour (0-23)
 * @param schedule - Daily schedule configuration
 * @returns true if equipment should be on
 */
export function isScheduleActive(
  hourOfDay: number,
  schedule: DailySchedule
): boolean {
  const { startHour, duration } = schedule;
  const endHour = (startHour + duration) % 24;

  // Handle schedule that wraps around midnight
  if (endHour <= startHour) {
    // Example: start=22, duration=8 → end=6
    // Active from 22-23 OR 0-6
    return hourOfDay >= startHour || hourOfDay < endHour;
  } else {
    // Example: start=8, duration=10 → end=18
    // Active from 8-17
    return hourOfDay >= startHour && hourOfDay < endHour;
  }
}

/**
 * Validate schedule parameters
 */
export function isValidSchedule(schedule: DailySchedule): boolean {
  return (
    schedule.startHour >= 0 &&
    schedule.startHour <= 23 &&
    schedule.duration > 0 &&
    schedule.duration <= 24
  );
}
```

### State Extensions

```typescript
import type { DailySchedule } from './schedule.js';

export interface Light {
  /** Whether light fixture is installed/enabled */
  enabled: boolean;
  /** Light power output in watts */
  wattage: number;
  /** Photoperiod schedule (start hour + duration) */
  schedule: DailySchedule;
}

export interface Equipment {
  // ... existing fields ...
  light: Light;
}

export interface PassiveResources {
  surface: number;
  flow: number;
  /** Light intensity in watts (0 when lights off) */
  light: number; // NEW
}
```

### Defaults

```typescript
export const DEFAULT_LIGHT: Light = {
  enabled: true,
  wattage: 100, // 100W default
  schedule: {
    startHour: 8, // 8am
    duration: 10, // 10 hours (8am-6pm)
  },
};
```

### Passive Resource Calculation

Update `calculatePassiveResources()` to include light:

```typescript
import { isScheduleActive } from './schedule.js';

export function calculatePassiveResources(state: SimulationState): PassiveResources {
  const { tank, equipment, tick } = state;
  const hourOfDay = tick % 24;

  // Surface area (existing)
  let surface = 0;
  // ... existing surface calculation ...

  // Flow (existing)
  let flow = 0;
  // ... existing flow calculation ...

  // Light (NEW)
  let light = 0;
  if (equipment.light.enabled) {
    const isActive = isScheduleActive(hourOfDay, equipment.light.schedule);
    if (isActive) {
      light = equipment.light.wattage;
    }
  }

  return { surface, flow, light };
}
```


## Implementation

### 1. Schedule Module (`src/simulation/schedule.ts`)

Create reusable scheduling utilities:

```typescript
/**
 * Centralized scheduling system for time-based equipment.
 * Supports daily photoperiod schedules (start hour + duration).
 */

/**
 * Daily photoperiod schedule - repeats every 24 hours
 */
export interface DailySchedule {
  /** Hour of day when equipment activates (0-23) */
  startHour: number;
  /** How many hours equipment stays on */
  duration: number;
}

/**
 * Check if equipment should be active based on current hour and schedule.
 * Handles schedules that wrap around midnight.
 *
 * @param hourOfDay - Current hour (0-23)
 * @param schedule - Daily schedule configuration
 * @returns true if equipment should be on
 *
 * @example
 * // Daytime schedule (8am-6pm)
 * isScheduleActive(10, { startHour: 8, duration: 10 }) // true
 * isScheduleActive(20, { startHour: 8, duration: 10 }) // false
 *
 * @example
 * // Midnight wrap-around (10pm-6am)
 * isScheduleActive(23, { startHour: 22, duration: 8 }) // true
 * isScheduleActive(2, { startHour: 22, duration: 8 })  // true
 * isScheduleActive(10, { startHour: 22, duration: 8 }) // false
 */
export function isScheduleActive(
  hourOfDay: number,
  schedule: DailySchedule
): boolean {
  const { startHour, duration } = schedule;
  const endHour = (startHour + duration) % 24;

  // Handle schedule that wraps around midnight
  if (endHour <= startHour) {
    // Wraps around: active from startHour to 23, then 0 to endHour
    return hourOfDay >= startHour || hourOfDay < endHour;
  } else {
    // Normal: active from startHour to endHour
    return hourOfDay >= startHour && hourOfDay < endHour;
  }
}

/**
 * Validate schedule parameters
 * @param schedule - Schedule to validate
 * @returns true if schedule is valid
 */
export function isValidSchedule(schedule: DailySchedule): boolean {
  return (
    Number.isInteger(schedule.startHour) &&
    schedule.startHour >= 0 &&
    schedule.startHour <= 23 &&
    schedule.duration > 0 &&
    schedule.duration <= 24
  );
}

/**
 * Format schedule as human-readable string
 * @example "8:00 - 18:00 (10h)"
 */
export function formatSchedule(schedule: DailySchedule): string {
  const startTime = `${schedule.startHour}:00`;
  const endHour = (schedule.startHour + schedule.duration) % 24;
  const endTime = `${endHour}:00`;
  return `${startTime} - ${endTime} (${schedule.duration}h)`;
}
```

### 2. State Updates (`src/simulation/state.ts`)

- Import `DailySchedule` from `./schedule.js`
- Add `Light` interface
- Extend `Equipment` with `light` field
- Add `light` to `PassiveResources`
- Add `DEFAULT_LIGHT` constant
- Update `createSimulation` to initialize light with defaults

### 3. Passive Resources Update (`src/simulation/passive-resources.ts`)

Update `calculatePassiveResources()` to include light:

```typescript
import { isScheduleActive } from './schedule.js';

export function calculatePassiveResources(state: SimulationState): PassiveResources {
  const { tank, equipment, tick } = state;
  const hourOfDay = tick % 24;

  // Surface area (existing)
  let surface = 0;
  surface += tank.bacteriaSurface;
  if (equipment.filter.enabled) {
    surface += getFilterSurface(equipment.filter.type);
  }
  surface += getSubstrateSurface(equipment.substrate.type, tank.capacity);
  surface += calculateHardscapeTotalSurface(equipment.hardscape.items);

  // Flow (existing)
  let flow = 0;
  if (equipment.filter.enabled) {
    flow += getFilterFlow(equipment.filter.type);
  }
  if (equipment.powerhead.enabled) {
    flow += getPowerheadFlow(equipment.powerhead.flowRateGPH);
  }

  // Light (NEW)
  let light = 0;
  if (equipment.light.enabled) {
    const isActive = isScheduleActive(hourOfDay, equipment.light.schedule);
    if (isActive) {
      light = equipment.light.wattage;
    }
  }

  return { surface, flow, light };
}
```

### 4. UI Component (`src/ui/components/equipment/LightCard.tsx`)

Create LightCard component with:

**Props:**
- `light: Light` - current light state
- `isCurrentlyOn: boolean` - derived from passiveResources.light > 0
- `onToggleEnabled: () => void`
- `onUpdateWattage: (wattage: number) => void`
- `onUpdateSchedule: (schedule: DailySchedule) => void`

**UI Elements:**
- Enabled/disabled toggle button
- Current status indicator (💡 On / ⚫ Off) - only when enabled
- Wattage selector dropdown (50W, 100W, 150W, 200W)
- Schedule controls (only when enabled):
  - Formatted schedule display using `formatSchedule()`
  - Start hour slider (0-23)
  - Duration slider (1-24)

Follow existing patterns from HardscapeCard, HeaterCard, etc.

### 5. Update EquipmentBar (`src/ui/components/layout/EquipmentBar.tsx`)

- Import LightCard
- Add LightCard to equipment grid
- Calculate `isLightOn` from `simulation.passiveResources.light > 0`
- Wire up handlers (see next section)

### 6. State Management Handlers

Add handlers to App.tsx or simulation hook (use Immer's `produce`):

- `handleToggleLightEnabled()` - Toggle `enabled` flag, log action
- `handleUpdateLightWattage(wattage)` - Update wattage, log change
- `handleUpdateLightSchedule(schedule)` - Update schedule, log with `formatSchedule()`

Follow existing patterns from heater, ATO handlers.

### 7. Update ResourcesPanel (Optional Enhancement)

Add light display to ResourcesPanel:
- Show "Light: {watts}W" when on
- Show "Light: Off" when off

## File Structure

```
src/simulation/
  state.ts                          # Add Light interface, extend Equipment, PassiveResources
  schedule.ts                       # New: Centralized scheduling module
  schedule.test.ts                  # New: Schedule tests
  passive-resources.ts              # Update to include light
  passive-resources.test.ts         # Update tests

src/ui/components/
  equipment/
    LightCard.tsx                   # New: Light management UI
  layout/
    EquipmentBar.tsx                # Add LightCard
    ResourcesPanel.tsx              # Optional: Display light in resources
```

## Acceptance Criteria

### Schedule Module
- [ ] `DailySchedule` interface with startHour (0-23) and duration (hours)
- [ ] `isScheduleActive(hourOfDay, schedule)` correctly determines if schedule is active
- [ ] `isScheduleActive` handles midnight wrap-around (e.g., 22:00-6:00)
- [ ] `isScheduleActive` handles normal schedules (e.g., 8:00-18:00)
- [ ] `isValidSchedule()` validates startHour (0-23) and duration (1-24)
- [ ] `formatSchedule()` returns human-readable string (e.g., "8:00 - 18:00 (10h)")

### Light Equipment
- [ ] `Light` interface with enabled, wattage, schedule
- [ ] Equipment has `light` field initialized with defaults
- [ ] Default: enabled=true, wattage=100W, schedule=8am-6pm (10h)
- [ ] PassiveResources has `light` field (watts)
- [ ] Light is 0 when disabled
- [ ] Light is 0 when outside schedule hours
- [ ] Light equals wattage when inside schedule hours
- [ ] 24-hour duration works correctly (always-on light)

### UI
- [ ] LightCard shows enabled/disabled toggle
- [ ] LightCard shows current light status (on/off indicator)
- [ ] LightCard shows wattage selector (50W, 100W, 150W, 200W)
- [ ] LightCard shows schedule controls (start hour slider, duration slider)
- [ ] LightCard shows formatted schedule string (e.g., "8:00 - 18:00 (10h)")
- [ ] Schedule controls only visible when enabled
- [ ] ResourcesPanel shows light status (optional enhancement)

### Logging
- [ ] Log when light enabled/disabled
- [ ] Log when wattage changed
- [ ] Log when schedule updated

### Integration
- [ ] `calculatePassiveResources` includes light calculation
- [ ] Light changes reflected in passiveResources.light each tick
- [ ] Light follows schedule automatically when enabled
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Test Scenarios

```typescript
// schedule.test.ts
describe('Schedule module', () => {
  describe('isScheduleActive', () => {
    it('returns true during active hours (normal schedule)', () => {
      const schedule = { startHour: 8, duration: 10 }; // 8am-6pm
      expect(isScheduleActive(8, schedule)).toBe(true);
      expect(isScheduleActive(12, schedule)).toBe(true);
      expect(isScheduleActive(17, schedule)).toBe(true);
    });

    it('returns false outside active hours (normal schedule)', () => {
      const schedule = { startHour: 8, duration: 10 }; // 8am-6pm
      expect(isScheduleActive(7, schedule)).toBe(false);
      expect(isScheduleActive(18, schedule)).toBe(false);
      expect(isScheduleActive(23, schedule)).toBe(false);
    });

    it('handles midnight wrap-around schedule', () => {
      const schedule = { startHour: 22, duration: 8 }; // 10pm-6am
      expect(isScheduleActive(22, schedule)).toBe(true);
      expect(isScheduleActive(23, schedule)).toBe(true);
      expect(isScheduleActive(0, schedule)).toBe(true);
      expect(isScheduleActive(5, schedule)).toBe(true);
      expect(isScheduleActive(6, schedule)).toBe(false);
      expect(isScheduleActive(12, schedule)).toBe(false);
    });

    it('handles 24-hour schedule', () => {
      const schedule = { startHour: 0, duration: 24 };
      for (let hour = 0; hour < 24; hour++) {
        expect(isScheduleActive(hour, schedule)).toBe(true);
      }
    });

    it('handles edge case: endHour = startHour (24h duration wrapping)', () => {
      const schedule = { startHour: 10, duration: 24 }; // Full day starting at 10
      for (let hour = 0; hour < 24; hour++) {
        expect(isScheduleActive(hour, schedule)).toBe(true);
      }
    });
  });

  describe('isValidSchedule', () => {
    it('validates correct schedules', () => {
      expect(isValidSchedule({ startHour: 0, duration: 24 })).toBe(true);
      expect(isValidSchedule({ startHour: 8, duration: 10 })).toBe(true);
      expect(isValidSchedule({ startHour: 23, duration: 1 })).toBe(true);
    });

    it('rejects invalid startHour', () => {
      expect(isValidSchedule({ startHour: -1, duration: 10 })).toBe(false);
      expect(isValidSchedule({ startHour: 24, duration: 10 })).toBe(false);
      expect(isValidSchedule({ startHour: 12.5, duration: 10 })).toBe(false);
    });

    it('rejects invalid duration', () => {
      expect(isValidSchedule({ startHour: 8, duration: 0 })).toBe(false);
      expect(isValidSchedule({ startHour: 8, duration: -5 })).toBe(false);
      expect(isValidSchedule({ startHour: 8, duration: 25 })).toBe(false);
    });
  });

  describe('formatSchedule', () => {
    it('formats normal schedule', () => {
      expect(formatSchedule({ startHour: 8, duration: 10 })).toBe('8:00 - 18:00 (10h)');
    });

    it('formats midnight wrap-around', () => {
      expect(formatSchedule({ startHour: 22, duration: 8 })).toBe('22:00 - 6:00 (8h)');
    });

    it('formats 24-hour schedule', () => {
      expect(formatSchedule({ startHour: 0, duration: 24 })).toBe('0:00 - 0:00 (24h)');
    });
  });
});

// passive-resources.test.ts (updated)
describe('calculatePassiveResources with light', () => {
  it('returns 0 light when light disabled', () => {
    const state = createSimulation(100);
    state.equipment.light.enabled = false;
    const resources = calculatePassiveResources(state);
    expect(resources.light).toBe(0);
  });

  it('returns wattage when schedule active', () => {
    const state = createSimulation(100);
    state.tick = 10; // hourOfDay = 10
    state.equipment.light.enabled = true;
    state.equipment.light.wattage = 150;
    state.equipment.light.schedule = { startHour: 8, duration: 10 }; // 8am-6pm
    const resources = calculatePassiveResources(state);
    expect(resources.light).toBe(150);
  });

  it('returns 0 when outside schedule', () => {
    const state = createSimulation(100);
    state.tick = 20; // hourOfDay = 20 (8pm)
    state.equipment.light.enabled = true;
    state.equipment.light.wattage = 150;
    state.equipment.light.schedule = { startHour: 8, duration: 10 }; // 8am-6pm
    const resources = calculatePassiveResources(state);
    expect(resources.light).toBe(0);
  });

  it('handles 24-hour duration (always-on)', () => {
    const state = createSimulation(100);
    state.equipment.light.enabled = true;
    state.equipment.light.wattage = 100;
    state.equipment.light.schedule = { startHour: 0, duration: 24 };

    // Test various hours - all should be on
    state.tick = 0;
    expect(calculatePassiveResources(state).light).toBe(100);
    state.tick = 12;
    expect(calculatePassiveResources(state).light).toBe(100);
    state.tick = 23;
    expect(calculatePassiveResources(state).light).toBe(100);
  });

  it('handles midnight wrap-around schedule', () => {
    const state = createSimulation(100);
    state.equipment.light.enabled = true;
    state.equipment.light.wattage = 100;
    state.equipment.light.schedule = { startHour: 22, duration: 8 }; // 10pm-6am

    // Test hours during active period
    state.tick = 23; // 11pm - should be on
    expect(calculatePassiveResources(state).light).toBe(100);

    state.tick = 2; // 2am - should be on
    expect(calculatePassiveResources(state).light).toBe(100);

    state.tick = 10; // 10am - should be off
    expect(calculatePassiveResources(state).light).toBe(0);
  });
});

// Integration tests
describe('Light equipment', () => {
  it('initializes with default values', () => {
    const state = createSimulation(100);
    expect(state.equipment.light.enabled).toBe(true);
    expect(state.equipment.light.wattage).toBe(100);
    expect(state.equipment.light.schedule.startHour).toBe(8);
    expect(state.equipment.light.schedule.duration).toBe(10);
  });

  it('can be disabled', () => {
    const state = createSimulation(100);
    state.equipment.light.enabled = false;
    expect(calculatePassiveResources(state).light).toBe(0);
  });

  it('can have wattage changed', () => {
    const state = createSimulation(100);
    state.tick = 10; // During schedule (8am-6pm default)
    state.equipment.light.wattage = 200;
    expect(calculatePassiveResources(state).light).toBe(200);
  });

  it('can have schedule updated', () => {
    const state = createSimulation(100);
    state.equipment.light.schedule = { startHour: 6, duration: 12 };
    state.tick = 6; // Start of new schedule
    expect(calculatePassiveResources(state).light).toBe(100);
    state.tick = 18; // End of new schedule
    expect(calculatePassiveResources(state).light).toBe(0);
  });

  it('supports always-on with 24h duration', () => {
    const state = createSimulation(100);
    state.equipment.light.schedule = { startHour: 0, duration: 24 };

    // Verify light is on at any time
    for (let hour = 0; hour < 24; hour++) {
      state.tick = hour;
      expect(calculatePassiveResources(state).light).toBe(100);
    }
  });
});
```

## Notes

- **Centralized Schedule Module**: Designed to be reusable by CO2, Auto Feeder, and Dosing equipment in future tasks
- **Simple Daily Photoperiod**: Repeats every 24 hours, sufficient for 90% of use cases
- **Schedule-Only Control**: When enabled, light always follows schedule (no manual mode)
- **Always-On Option**: Set duration to 24 hours for lights that never turn off
- **Midnight Wrap-Around**: Handles schedules like 10pm-6am correctly (important for reverse lighting)
- **Passive Resource**: Light is recalculated fresh each tick based on schedule, not accumulated
- **No Transitions Mid-Tick**: Lights turn on/off at hour boundaries (tick boundaries), not gradually
- **Future CO2 Integration**: CO2 system will reuse `DailySchedule` and `isScheduleActive()` unchanged
- **Logging**: All user actions logged (enabled/disabled, wattage changes, schedule updates)
- **UI/UX**: Visual indicator shows current state; sliders provide intuitive schedule control
- **Extension Path**: Advanced schedules (siesta, weekly patterns) can extend `DailySchedule` in future
- **Plants/Algae**: Light consumer logic deferred to future tasks (6-PLANTS.md, algae task)
- This task completes the foundation for time-based equipment and enables plant photosynthesis implementation

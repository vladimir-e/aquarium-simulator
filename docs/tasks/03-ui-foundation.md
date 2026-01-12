# Task 03: UI Foundation

**Status:** completed

## Overview

Bootstrap the simulation UI with React and Tailwind CSS. Set up the page layout with all sections from the wireframe, implement timeline controls for tick management, and add equipment bar with heater controls.

## Tech Stack

- React 18+ with Vite
- Tailwind CSS
- Integrated in root project (UI source in `src/ui/`)

## Scope

### In Scope
- Vite + React + Tailwind setup in root package
- Page layout with all panel placeholders
- Timeline section with tick controls
- Equipment bar with heater settings
- Environment panel with room temperature control
- Tank size selector
- Visualization panel showing water level %
- Integration with simulation engine

### Out of Scope
- Water chemistry panel content
- Plants panel content
- Livestock panel content
- Actions panel content
- Scheduled panel content
- Log panel content
- Tank preset selector

## Layout

### Structure
```
┌─────────────────────────────────────────────────────────┐
│ Timeline (sticky)                                       │
├─────────────────────────────────────────────────────────┤
│ Equipment Bar (sticky, expandable)                      │
├─────────────────────────────────────────────────────────┤
│ Scrollable Content Area                                 │
│ ┌──────────┬──────────────┬──────────┬────────────────┐ │
│ │ Col 1    │ Col 2        │ Col 3    │ Col 4          │ │
│ │          │              │          │                │ │
│ │ Tank     │ Visualization│ Plants   │ Livestock      │ │
│ │ preset   │              │          │                │ │
│ │          │              │          │                │ │
│ │ Tank     │ Water        │          │                │ │
│ │ size     │ chemistry    │          │                │ │
│ │          │              │          │                │ │
│ │ Environ- │              │          │                │ │
│ │ ment     │              │          │                │ │
│ │          │              │          │                │ │
│ │ Scheduled│              │          │                │ │
│ │          │              │          │                │ │
│ │ Actions  │              │          │                │ │
│ └──────────┴──────────────┴──────────┴────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Log (full width)                                    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Responsive Behavior
- **Desktop (4 columns):** Full layout as shown above
- **Tablet portrait (2 columns):** Panels stack into 2 columns
- **Mobile (1 column):** All panels stack vertically

### Sticky Elements
- Timeline bar: Fixed at top
- Equipment bar: Fixed below timeline

## Implementation

### 1. Project Setup

Add to root `package.json`:
- Dependencies: `react`, `react-dom`
- Dev dependencies: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`
- Script: `"ui": "vite"` (runs dev server)
- Script: `"ui:build": "vite build"`

Create Vite config pointing to `src/ui/` as root, with output to `dist-ui/`.

Configure Tailwind with dark theme matching the style reference.

### 2. Timeline Section

**Layout:** Step button | [Spacer] | Play + Speed controls | Day/Time/Tick display

**Controls:**
- **Step button:** Advances simulation by one tick. Keyboard shortcut: Spacebar
- **Play/Pause button:** Toggles auto-advance
- **Speed presets:** 1hr/s, 6hr/s, 12hr/s, 1day/s (buttons, one active at a time)
- **Display:** Day counter, time (HH:MM), tick number

**Behavior:**
- When playing, advance ticks based on selected speed
- 1 tick = 1 hour in simulation time
- Day = tick / 24

### 3. Equipment Bar

**Collapsed state:** Shows equipment icons with status indicators (green dot = on, gray = off)

**Expanded state:** Shows equipment cards with controls

**Heater Card:**
- Enable/disable toggle switch
- Target temperature stepper (°C) - increment/decrement buttons
- Wattage select dropdown: 50W / 100W / 200W / 300W / 500W / 1000W
- isOn indicator (green dot when actively heating)

### 4. Environment Panel

**Controls:**
- Room temperature stepper (°C)
- Display current water temperature (read-only, from simulation state)

### 5. Tank Size Panel

**Control:** Dropdown select with preset sizes

| Display | Liters | ~Gallons |
|---------|--------|----------|
| 20L     | 20     | 5 gal    |
| 40L     | 40     | 10 gal   |
| 75L     | 75     | 20 gal   |
| 150L    | 150    | 40 gal   |
| 200L    | 200    | 50 gal   |
| 300L    | 300    | 75 gal   |
| 400L    | 400    | 100 gal  |

Note: Changing tank size should reset/reinitialize the simulation.

### 6. Visualization Panel

**Content:**
- Water level display as percentage (e.g., "97.3%")
- Simple visual indicator (progress bar or similar)

### 7. Placeholder Panels

Create empty panel components with just titles for:
- Tank preset
- Scheduled
- Actions
- Water chemistry
- Plants
- Livestock
- Log

### 8. Simulation Integration

```typescript
// Initialize simulation
const initialState = createSimulation({
  tank: { capacity: 75 },  // Default 75L
  environment: { roomTemperature: 22 },
  equipment: {
    heater: {
      enabled: true,
      targetTemperature: 25,
      wattage: 100
    }
  }
});

// On each tick (manual or auto)
const newState = tick(currentState);
```

### 9. State Management

Use React state (useState/useReducer) for:
- Simulation state
- UI state (play/pause, speed, equipment bar expanded)

## File Structure

```
src/
  ui/
    components/
      layout/
        Timeline.tsx
        EquipmentBar.tsx
        Panel.tsx           # Reusable panel wrapper
      panels/
        TankPreset.tsx      # Placeholder
        TankSize.tsx
        Environment.tsx
        Scheduled.tsx       # Placeholder
        Actions.tsx         # Placeholder
        Visualization.tsx
        WaterChemistry.tsx  # Placeholder
        Plants.tsx          # Placeholder
        Livestock.tsx       # Placeholder
        Log.tsx             # Placeholder
      equipment/
        HeaterCard.tsx
      ui/
        Button.tsx
        Select.tsx
        Stepper.tsx
        Toggle.tsx
    hooks/
      useSimulation.ts      # Simulation state management
      useKeyboardShortcuts.ts
    App.tsx
    main.tsx
    index.css               # Tailwind imports
    index.html              # Vite entry HTML
  simulation/               # Existing simulation code
    ...
vite.config.ts              # Vite config for UI
tailwind.config.js          # Tailwind config
```

## Visual Style

Match the dark theme from reference screenshot:
- Background: Dark slate (~#1a1f2e)
- Panel background: Slightly lighter (#242938)
- Text: Light gray/white
- Accents: Green for "on" states, orange for active buttons
- Borders: Subtle, rounded corners
- Cards: Rounded with subtle borders

## Acceptance Criteria

- [ ] `npm run ui` starts dev server
- [ ] `npm run ui:build` builds UI to `dist-ui/`
- [ ] 4-column responsive layout (4 → 2 → 1 columns)
- [ ] Timeline is sticky at top
- [ ] Equipment bar is sticky, expands/collapses
- [ ] Step button advances simulation by 1 tick
- [ ] Spacebar shortcut works for step
- [ ] Play/pause toggles auto-advance
- [ ] Speed controls change tick rate
- [ ] Day/time/tick display updates correctly
- [ ] Heater controls work (enable, target temp, wattage)
- [ ] Heater isOn indicator reflects simulation state
- [ ] Room temperature is adjustable
- [ ] Tank size selector reinitializes simulation
- [ ] Water level % displays correctly
- [ ] All placeholder panels render with titles
- [ ] Dark theme matches style reference
- [ ] README updated with `npm run ui` instructions

## Tests

Focus on integration tests for simulation hooks:
```typescript
// useSimulation.test.ts
- initializes simulation with default config
- tick advances simulation state
- changing tank size reinitializes simulation
- heater controls update simulation state
- room temperature changes update simulation state
```

Component tests are lower priority for this task.

## Notes

- 1 tick = 1 hour of simulation time
- Default tank: 75L
- Default room temp: 22°C
- Default heater: enabled, 25°C target, 100W
- Evaporation will slowly decrease water level over time
- Temperature will drift toward room temp unless heater maintains it

# Task 23: Game UI Foundation

**Status:** completed

## Overview

Create the foundation for a new game-like UI under `/game` at the project root. This is a completely separate build from the existing `/src/ui` - no code sharing, independent design system, but imports the simulation engine from `src/engine/`.

The game UI provides a simplified, visually engaging interface for interacting with the aquarium simulation. It features a central tank visualization (using Pixi.js for smooth fish animations) surrounded by tabbed panels for managing equipment, plants, livestock, and actions.

## References

- Wireframes: `docs/ui-wireframes.jpeg`
- Design doc: `docs/1-DESIGN.md` (for simulation context)

## Scope

### In Scope

1. **Build Setup**
   - New Vite config (`vite.game.config.ts`) in project root
   - Shared `package.json` - add new dependencies and scripts
   - Tailwind CSS v4 configured for `/game`
   - Entry point and HTML template

2. **Responsive Layout Shell**
   - Single breakpoint: 1024px (iPad 11" landscape threshold)
   - **Same vertical layout for both**, only card columns differ:
     - Timeline header (centered)
     - Tank canvas
     - Tab pills
     - Panel content (scrollable)
   - **Mobile** (< 1024px): Top ~50% fixed (timeline+tank+pills), bottom ~50% scrollable, single column cards
   - **Desktop** (>= 1024px): Top ~60% fixed, bottom ~40% scrollable, cards spread to 2-4 columns
   - Top section fixed, panel area scrollable

3. **Design System**
   - Color palette: Slightly cartoonish, vibrant but harmonious
   - Typography scale: Clean, readable, game-appropriate
   - Spacing system: Consistent rhythm
   - Component tokens: Borders, shadows, radii
   - CSS custom properties for theming

4. **Core Components**
   - `Timeline`: Time display (HH:MM, Day N), Play/Pause, Fast-forward
   - `TabBar`: Pill-style tabs with smooth selection animation
   - `TabPanel`: Container with enter/exit transitions
   - `TankCanvas`: Pixi.js canvas placeholder (water background, no fish yet)

5. **Tab Structure (Stubs)**
   - Tank: Tank info placeholder
   - Equipment: Equipment list placeholder
   - Plants: Plant list placeholder
   - Livestock: Livestock list placeholder
   - Actions: Action buttons placeholder
   - Logs: Event log placeholder

6. **Pixi.js Integration**
   - Install `pixi.js` and `@pixi/react`
   - Basic canvas setup with water gradient background
   - Responsive canvas sizing
   - Placeholder for future fish/plant sprites

### Out of Scope

- Fish animation and movement logic (future task)
- Plant/hardscape rendering (future task)
- Actual panel content and functionality (future tasks)
- Wiring to simulation state (future task - just scaffolding now)
- Dark/light theme switching (can add later)
- Sound effects

## Implementation

### Project Structure

**Root level (new files):**
- `vite.game.config.ts` - Vite config for game build
- `vitest.game.config.ts` - Vitest config for game tests

**Game directory:**
```
/game
├── index.html
├── main.tsx
├── App.tsx
├── index.css                 # Tailwind + design tokens
├── README.md                 # Documentation (see below)
├── assets/                   # Static assets
│   ├── fish/                 # Fish sprite sheets
│   ├── plants/               # Plant images
│   ├── hardscape/            # Rocks, driftwood, etc.
│   └── substrate/            # Ground textures
├── components/
│   ├── layout/
│   │   ├── GameShell.tsx     # Main responsive layout
│   │   ├── Timeline.tsx      # Time + controls header
│   │   └── TabBar.tsx        # Pill tabs with animation
│   ├── tank/
│   │   └── TankCanvas.tsx    # Pixi.js canvas wrapper
│   └── panels/
│       ├── TankPanel.tsx
│       ├── EquipmentPanel.tsx
│       ├── PlantsPanel.tsx
│       ├── LivestockPanel.tsx
│       ├── ActionsPanel.tsx
│       └── LogsPanel.tsx
└── hooks/
    └── useSimulation.ts      # Import and use engine (stub)
```

### README Documentation

Create `/game/README.md` with the following sections:

**1. Quick Start**
- Prerequisites (Node version, etc.)
- Installation: `npm install`
- Development: `npm run dev:game`
- Production build: `npm run build:game`
- Preview production: `npm run preview:game`

**2. Tech Stack**
- React 18 - UI framework
- Vite - Build tool and dev server
- Tailwind CSS v4 - Utility-first styling
- Pixi.js - 2D WebGL rendering for tank visualization
- @pixi/react - React bindings for Pixi
- Framer Motion - UI animations

**3. Project Structure**
- Directory overview with descriptions
- Key files and their purposes

**4. Design System**
Document all design tokens with their values:
- Color palette (CSS custom properties)
- Typography scale
- Spacing scale
- Border radii
- Shadows
- Animation timing/easing values

**5. Component Patterns**
- How layout components work
- Tab system usage
- Adding new panels

**6. Pixi.js Integration**
- Canvas layer structure
- How to add new sprites
- Coordinate system and scaling

**7. Asset Guidelines**
- Fish sprite sheet format and naming
- Plant/hardscape image requirements
- File organization in `/game/assets/`

**8. Responsive Behavior**
- Breakpoint: 1024px
- Same vertical layout on both (timeline → tank → pills → panel)
- Mobile: 50/50 split, single column cards
- Desktop: 60/40 split, 2-4 column cards

### Build Configuration

**New scripts in package.json:**
```json
{
  "scripts": {
    "dev:game": "vite --config vite.game.config.ts",
    "build:game": "vite build --config vite.game.config.ts",
    "preview:game": "vite preview --config vite.game.config.ts",
    "test:game": "vitest run --config vitest.game.config.ts",
    "test:game:watch": "vitest --config vitest.game.config.ts"
  }
}
```

### Linting & Testing Setup

**ESLint:**
- Update root `lint` script to include `/game`: `eslint 'src/**/*.{ts,tsx}' 'game/**/*.{ts,tsx}'`
- Or add separate `lint:game` script: `eslint 'game/**/*.{ts,tsx}'`
- Same ESLint config as main project (TypeScript + React rules)

**Vitest Configuration:**
Create `vitest.game.config.ts` in project root:
- Include: `game/**/*.test.ts`, `game/**/*.test.tsx`
- Environment: `happy-dom` (consistent with main project)
- Coverage include: `game/**/*.ts`, `game/**/*.tsx`
- Coverage exclude: test files, index files

**Test File Structure:**
```
/game
├── components/
│   ├── layout/
│   │   ├── GameShell.tsx
│   │   ├── GameShell.test.tsx    # Layout smoke tests
│   │   ├── TabBar.tsx
│   │   └── TabBar.test.tsx       # Tab interaction tests
│   └── ...
└── ...
```

**Smoke Tests to Include:**

1. **GameShell.test.tsx:**
   - Renders without crashing
   - Contains Timeline component
   - Contains TankCanvas component
   - Contains TabBar component
   - Responsive class switching (mock matchMedia for breakpoint testing)

2. **TabBar.test.tsx:**
   - Renders all 6 tab pills
   - Clicking a tab calls selection handler
   - Active tab has correct styling/aria state
   - Tabs are keyboard accessible

3. **Timeline.test.tsx:**
   - Renders time display
   - Renders day counter
   - Renders play/pause button
   - Renders fast-forward button

4. **TankCanvas.test.tsx:**
   - Canvas container renders
   - (Pixi internals mocked - just test the wrapper)

**New dependencies:**
- `pixi.js` - 2D WebGL renderer
- `@pixi/react` - React bindings for Pixi
- `framer-motion` - UI animations (tab transitions)

**Existing dependencies (already in package.json):**
- `vitest` + `happy-dom` - Testing
- `@testing-library/react` - Component testing
- `eslint` + TypeScript plugins - Linting

### Design System Guidelines

**Color Palette (suggested starting point):**
- Water blue: Vibrant aqua tones for tank
- UI background: Soft, slightly warm neutral
- Accent: Teal/cyan for interactive elements (pills, buttons)
- Status colors: Green (healthy), amber (warning), coral (danger)
- Text: High contrast, slightly softer than pure black

**Typography:**
- Primary font: System UI stack or a friendly sans-serif
- Time display: Slightly playful, could be monospace or tabular
- Body text: Clean and readable
- Scale: 12/14/16/20/24/32px (or similar progression)

**Animation Principles:**
- Subtle, not distracting
- ~200-300ms for UI transitions
- Ease-out for entries, ease-in for exits
- Tab pills: Background slides to selected tab
- Panel transitions: Subtle fade or slide

### Responsive Layout Details

**Both layouts share the same vertical structure:**
```
┌─────────────────────────────────────────────────────┐
│           [>][>>] 11:00  Day 24                     │  <- Timeline (centered)
├─────────────────────────────────────────────────────┤
│                                                     │
│                  Tank Canvas                        │  <- Tank visualization
│                                                     │
├─────────────────────────────────────────────────────┤     FIXED
│        [Tank][Equip][Plants][Live][Act][Log]        │  <- Tab pills
├─────────────────────────────────────────────────────┤
│                                                     │
│                  Panel Content                      │     SCROLLABLE
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Mobile (< 1024px):**
- Fixed section: ~50% viewport height
- Panel cards: single column

**Desktop (>= 1024px):**
- Fixed section: ~60% viewport height
- Panel cards: 2-4 columns (responsive grid)

### Pixi.js Canvas Setup

Basic canvas with:
- Responsive sizing (fills container)
- Water gradient background (light blue top to darker blue bottom)
- Subtle water surface line
- Ready for sprite layers: background → plants → fish → foreground

```typescript
// Conceptual layer structure for future
const layers = {
  background: 0,  // Substrate, back plants
  midground: 1,   // Hardscape, mid plants
  fish: 2,        // Swimming fish
  foreground: 3,  // Front plants, bubbles
  surface: 4,     // Water line, floating plants
}
```

## Acceptance Criteria

1. `npm run dev:game` starts the game UI on a different port than main UI
2. `npm run build:game` produces a working production build
3. Layout correctly switches between mobile/desktop at 1024px breakpoint
4. Tab pills animate smoothly on selection
5. Panel content transitions smoothly when switching tabs
6. Pixi canvas renders and resizes responsively
7. Canvas shows water gradient background
8. All six tab panels render their placeholder content
9. Timeline shows static time (11:00, Day 1) and non-functional buttons
10. Code passes linting (game code included in lint scope)
11. Design tokens are documented in CSS custom properties
12. `/game/README.md` exists with all sections documented (Quick Start, Tech Stack, Design System, etc.)
13. `npm run test:game` runs and all tests pass
14. Smoke tests exist for GameShell, TabBar, Timeline, and TankCanvas components

## Tests

**Automated (Vitest + Testing Library):**
- `GameShell.test.tsx` - Layout renders, contains all major sections, responsive behavior
- `TabBar.test.tsx` - Renders tabs, handles selection, keyboard accessible
- `Timeline.test.tsx` - Renders time, day, and control buttons
- `TankCanvas.test.tsx` - Container renders (Pixi mocked)

**Manual verification:**
- Responsive breakpoint switches correctly at 1024px
- Tab selection animation is smooth
- Panel transition animation is smooth
- Pixi canvas resizes with window

## Notes

- This is scaffolding only - no simulation wiring yet
- Keep components simple and ready for future enhancement
- Design system should feel cohesive and intentional
- Pixi.js setup should be clean and extensible for adding fish later
- Consider using CSS container queries if beneficial, but media queries are fine

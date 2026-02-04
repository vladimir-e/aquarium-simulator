# Aquarium Simulator - Game UI

A simplified, visually engaging interface for interacting with the aquarium simulation. Features a central tank visualization using Pixi.js surrounded by tabbed panels for managing equipment, plants, livestock, and actions.

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

```bash
npm install
```

### Development

Start the development server (runs on port 3001):

```bash
npm run dev:game
```

### Production Build

Build for production:

```bash
npm run build:game
```

Preview production build:

```bash
npm run preview:game
```

### Testing

Run all game tests:

```bash
npm run test:game
```

Run tests in watch mode:

```bash
npm run test:game:watch
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with functional components and hooks |
| **Vite** | Build tool and dev server |
| **Tailwind CSS v4** | Utility-first styling with custom design tokens |
| **Pixi.js** | 2D WebGL rendering for tank visualization |
| **Framer Motion** | UI animations (tab transitions, panel enter/exit) |
| **Vitest** | Unit testing framework |
| **Testing Library** | Component testing utilities |

## Project Structure

```
/game
├── index.html              # HTML template
├── main.tsx               # Application entry point
├── App.tsx                # Root component with state management
├── index.css              # Tailwind CSS + design tokens
├── README.md              # This file
├── assets/                # Static assets
│   ├── fish/              # Fish sprite sheets (future)
│   ├── plants/            # Plant images (future)
│   ├── hardscape/         # Rocks, driftwood, etc. (future)
│   └── substrate/         # Ground textures (future)
├── components/
│   ├── layout/
│   │   ├── GameShell.tsx      # Main responsive layout
│   │   ├── GameShell.test.tsx # Layout tests
│   │   ├── Timeline.tsx       # Time + controls header
│   │   ├── Timeline.test.tsx  # Timeline tests
│   │   ├── TabBar.tsx         # Pill tabs with animation
│   │   └── TabBar.test.tsx    # TabBar tests
│   ├── tank/
│   │   ├── TankCanvas.tsx     # Pixi.js canvas wrapper
│   │   └── TankCanvas.test.tsx
│   └── panels/
│       ├── TankPanel.tsx      # Tank info display
│       ├── EquipmentPanel.tsx # Equipment controls
│       ├── PlantsPanel.tsx    # Plant management
│       ├── LivestockPanel.tsx # Fish/invertebrate list
│       ├── ActionsPanel.tsx   # User action buttons
│       └── LogsPanel.tsx      # Event log display
└── hooks/
    └── useSimulation.ts   # Simulation state hook (stub)
```

## Design System

All design tokens are defined as CSS custom properties in `index.css` for easy theming and modification.

### Color Palette

| Token | Value | Purpose |
|-------|-------|---------|
| `--color-water-surface` | `#7DD3FC` | Light cyan, water surface |
| `--color-water-mid` | `#38BDF8` | Sky blue, mid-depth |
| `--color-water-deep` | `#0284C7` | Darker blue, deep water |
| `--color-water-floor` | `#075985` | Deepest blue, substrate |
| `--color-bg-primary` | `#F8FAFC` | Main background |
| `--color-bg-secondary` | `#F1F5F9` | Panel backgrounds |
| `--color-bg-card` | `#FFFFFF` | Card backgrounds |
| `--color-accent-primary` | `#14B8A6` | Interactive elements |
| `--color-accent-hover` | `#0D9488` | Hover state |
| `--color-accent-active` | `#0F766E` | Active/pressed state |
| `--color-tab-active` | `#14B8A6` | Active tab pill |
| `--color-status-healthy` | `#22C55E` | Healthy/good status |
| `--color-status-warning` | `#F59E0B` | Warning status |
| `--color-status-danger` | `#EF4444` | Danger/critical status |
| `--color-text-primary` | `#1E293B` | Primary text |
| `--color-text-secondary` | `#64748B` | Secondary text |
| `--color-text-muted` | `#94A3B8` | Muted/disabled text |

### Typography Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--font-family-primary` | Inter, system-ui | Main UI text |
| `--font-family-mono` | ui-monospace | Code/numbers |
| `--font-size-xs` | 0.75rem (12px) | Small labels |
| `--font-size-sm` | 0.875rem (14px) | Body text |
| `--font-size-base` | 1rem (16px) | Default text |
| `--font-size-lg` | 1.25rem (20px) | Subheadings |
| `--font-size-xl` | 1.5rem (24px) | Headings |
| `--font-size-2xl` | 2rem (32px) | Large headings |
| `--font-size-3xl` | 2.5rem (40px) | Hero text |

### Spacing Scale

Based on 4px unit:

| Token | Value |
|-------|-------|
| `--spacing-1` | 0.25rem (4px) |
| `--spacing-2` | 0.5rem (8px) |
| `--spacing-3` | 0.75rem (12px) |
| `--spacing-4` | 1rem (16px) |
| `--spacing-6` | 1.5rem (24px) |
| `--spacing-8` | 2rem (32px) |

### Border Radii

| Token | Value |
|-------|-------|
| `--radius-sm` | 0.25rem (4px) |
| `--radius-md` | 0.5rem (8px) |
| `--radius-lg` | 0.75rem (12px) |
| `--radius-xl` | 1rem (16px) |
| `--radius-full` | 9999px |

### Shadows

| Token | Usage |
|-------|-------|
| `--shadow-sm` | Subtle elevation |
| `--shadow-md` | Standard cards |
| `--shadow-lg` | Elevated dialogs |
| `--shadow-card` | Card-specific shadow |

### Animation

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | Micro-interactions |
| `--duration-normal` | 200ms | Standard transitions |
| `--duration-slow` | 300ms | Panel transitions |
| `--easing-ease-out` | cubic-bezier(0, 0, 0.2, 1) | Entry animations |
| `--easing-ease-in` | cubic-bezier(0.4, 0, 1, 1) | Exit animations |
| `--easing-spring` | cubic-bezier(0.175, 0.885, 0.32, 1.275) | Bouncy effects |

## Component Patterns

### Layout Structure

The `GameShell` component provides the main layout with slots for:
- `header`: Timeline component
- `tank`: TankCanvas component
- `tabs`: TabBar component
- `panel`: Active panel content

```tsx
<GameShell
  header={<Timeline {...timelineProps} />}
  tank={<TankCanvas />}
  tabs={<TabBar activeTab={tab} onTabChange={setTab} />}
  panel={<ActivePanel />}
/>
```

### Tab System

Tabs are defined in `TabBar.tsx`. To add a new tab:

1. Add the tab ID to the `TabId` type
2. Add entry to `TABS` array
3. Create the panel component
4. Add case to `renderPanel()` in `App.tsx`

### Adding New Panels

1. Create panel component in `components/panels/`
2. Follow the card grid pattern for responsive layout
3. Use role="tabpanel" and id="panel-{tabId}" for accessibility

## Pixi.js Integration

### Canvas Layer Structure

The TankCanvas uses a layered container system for sprite ordering:

```typescript
const LAYERS = {
  background: 0,  // Substrate, back plants
  midground: 1,   // Hardscape, mid plants
  fish: 2,        // Swimming fish
  foreground: 3,  // Front plants, bubbles
  surface: 4,     // Water line, floating plants
};
```

### Adding New Sprites (Future)

Sprites should be added to the appropriate layer container:

```typescript
const fishLayer = app.stage.getChildByLabel('fish');
fishLayer.addChild(newFishSprite);
```

### Coordinate System

- Origin (0, 0) is top-left
- X increases rightward
- Y increases downward
- Canvas auto-scales to fill container

## Asset Guidelines

### Fish Sprite Sheets

- Format: PNG with transparency
- Recommended size: 64x64 or 128x128 per frame
- Animation frames in horizontal strip
- Naming: `{species}-{variant}.png`

### Plant Images

- Format: PNG with transparency
- Multiple size variants recommended
- Naming: `{species}-{size}.png`

### Hardscape/Substrate

- Format: PNG, can tile if needed
- Naming: `{type}-{variant}.png`

## Responsive Behavior

### Breakpoint: 1024px

The layout uses a single breakpoint for desktop/mobile:

| | Mobile (< 1024px) | Desktop (>= 1024px) |
|---|---|---|
| Fixed section | 50% viewport | 60% viewport |
| Panel cards | 1 column | 2-4 columns |

### Layout Structure (Both)

```
┌─────────────────────────────────────────────────────┐
│           [>][>>] 11:00  Day 24                     │  Timeline
├─────────────────────────────────────────────────────┤
│                                                     │
│                  Tank Canvas                        │  Fixed
│                                                     │
├─────────────────────────────────────────────────────┤
│        [Tank][Equip][Plants][Live][Act][Log]        │  Tabs
├─────────────────────────────────────────────────────┤
│                                                     │
│                  Panel Content                      │  Scrollable
│                                                     │
└─────────────────────────────────────────────────────┘
```

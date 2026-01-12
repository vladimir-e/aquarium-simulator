# Aquarium Simulator

A comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment.

## Setup

```bash
npm install
```

## Commands

```bash
npm run build          # Compile TypeScript
npm run lint           # Run ESLint
npm run test           # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
npm run ui             # Start UI dev server at localhost:3000
npm run ui:build       # Build UI to dist-ui/
```

## UI

The simulation includes a web-based UI built with React and Tailwind CSS.

```bash
npm run ui
```

Open [http://localhost:3000](http://localhost:3000) to view the simulation dashboard.

### Controls

- **Step button** or **Spacebar**: Advance simulation by 6 ticks
- **Play/Pause** or **P key**: Toggle auto-advance
- **Speed presets**: 1hr/s, 6hr/s, 12hr/s, 1day/s

### Features

- Timeline with play/pause and speed controls
- Equipment bar with heater settings
- Environment panel (room temperature)
- Tank size selection
- Water level visualization

## Documentation

Full specifications are in the [`docs/`](docs/) folder. Start with [1-DESIGN.md](docs/1-DESIGN.md) for architecture overview.

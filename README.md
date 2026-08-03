# Aquarium Simulator

A comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment.

**Live Demo:** https://sim.fishroom.app

## Install

```bash
npm install aquarium-simulator
```

## Quick Start

```ts
import { createSimulation, tick } from 'aquarium-simulator';

// Create a 60 L tank. Only `tankCapacity` is required; every other
// parameter (heater, lid, substrate, lighting, …) falls back to a default.
let state = createSimulation({ tankCapacity: 60 });

// Each tick advances the ecosystem by one hour. Simulate a full day.
for (let hour = 0; hour < 24; hour++) {
  state = tick(state);
}

console.log(`After ${state.tick} ticks:`);
console.log(`  temperature: ${state.resources.temperature.toFixed(1)} °C`);
console.log(`  ammonia:     ${state.resources.ammonia.toFixed(2)} mg`);
```

The engine is pure and immutable: `tick(state)` returns a new state and never
mutates its input, so you own persistence, scheduling, and rendering. See the
[`docs/`](docs/) folder for the full API surface and simulation model.

### Starting a tank at a state

A fresh tank is empty and uncycled. Pass a `PresetSeed` to start it wherever
you want to watch it from — a colony, chemistry stocks, fish at an age and
sex, plants at a size — and it needs no simulated weeks to get there.

```ts
import { createSimulation, createPresetSimulation, getPresetById } from 'aquarium-simulator';

const stocked = createSimulation(
  { tankCapacity: 150 },
  {
    bacteria: 'cycled', // sized to this tank's water
    fish: [{ species: 'neon_tetra', count: 12 }],
    plants: [{ species: 'java_fern', count: 3, size: 100 }],
  }
);

// The tanks the app ships — `PRESETS` pairs each config with its starting state.
const planted = createPresetSimulation(getPresetById('planted')!);
```

Nothing in a seed is validated or clamped, so a scenario can construct states
no keeper could reach. A third `rng` argument makes the roster's individual
variation reproducible.

## Setup

```bash
npm install
```

## Commands

```bash
npm run ui             # Launch control panel
npm run build          # Compile TypeScript
npm run lint           # Run ESLint
npm run test           # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

## Documentation

Full specifications are in the [`docs/`](docs/) folder. Start with [1-DESIGN.md](docs/1-DESIGN.md) for architecture overview.

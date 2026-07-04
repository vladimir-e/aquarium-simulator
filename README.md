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

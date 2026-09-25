# Aquarium Simulator

A simulation engine for a freshwater aquarium. One hourly tick moves the whole
tank: heat, light, water chemistry, the nitrogen cycle, plants, algae and fish,
each reading from and writing to the same shared stocks. The engine is pure and
immutable — `tick(state)` returns a new state — so persistence, scheduling and
rendering are yours.

**Demo:** [engine.fishroom.app](https://engine.fishroom.app) · **Docs:** [docs.fishroom.app](https://docs.fishroom.app)

## Install

```bash
npm install aquarium-simulator
```

## Usage

```ts
import { applyAction, createSimulation, tick } from 'aquarium-simulator';

const GALLON = 3.785; // the engine works in litres and °C

let state = createSimulation(
  { tankCapacity: 20 * GALLON },
  { bacteria: 'cycled', fish: [{ species: 'neon_tetra', count: 10 }] }
);

for (let hour = 0; hour < 24 * 7; hour++) state = tick(state);

state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;

const { nitrate, water, temperature } = state.resources;
console.log(`NO₃ ${(nitrate / water).toFixed(1)} ppm at ${(temperature * 1.8 + 32).toFixed(1)} °F`);
```

## Demo UI

```bash
npm install
npm run ui
```

## Scenarios

`npm run scenarios` runs six preset tanks headless on a keeper's schedule and
grades each reading green, amber or red against what a real tank shows.

```bash
npm run scenarios                                           # every tank
npm run scenarios -- low-tech --water-change=off --days=30  # skip water changes, watch nitrate climb
npm run scenarios -- --json=/tmp/before.json                # save a baseline…
npm run scenarios -- --diff=/tmp/before.json                # …and show only what moved
```

Flags are in [`docs/cli.md`](docs/cli.md).

## Documentation

[docs.fishroom.app](https://docs.fishroom.app) covers the whole system: concepts,
one page per subsystem, and reference tables.

## License

MIT

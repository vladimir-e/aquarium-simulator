import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { getPpm } from '../resources/helpers.js';

describe('Evaporation integration', () => {
  it('water level decreases over ticks from evaporation', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
    });

    const initialWater = state.resources.water;

    for (let i = 0; i < 24; i++) {
      state = tick(state);
    }

    expect(state.resources.water).toBeLessThan(initialWater);
    expect(state.resources.water).toBeGreaterThan(0);
  });

  it('higher temperature increases evaporation rate', () => {
    let coolState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
      heater: { enabled: false },
    });

    let hotState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 30,
      roomTemperature: 22,
      heater: { enabled: false },
    });

    // Run enough ticks to accumulate measurable difference.
    // Temperature will drift toward room temp over time,
    // but the hot tank starts with a larger delta and evaporates faster.
    for (let i = 0; i < 24; i++) {
      coolState = tick(coolState);
      hotState = tick(hotState);
    }

    const coolLoss = 100 - coolState.resources.water;
    const hotLoss = 100 - hotState.resources.water;

    // Hotter water evaporates faster
    expect(hotLoss).toBeGreaterThan(coolLoss);
  });

  it('lid reduces evaporation (compare lid types: none, mesh, full, sealed)', () => {
    const runWithLid = (lidType: 'none' | 'mesh' | 'full' | 'sealed'): number => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        roomTemperature: 22,
        lid: { type: lidType },
        heater: { enabled: false },
      });

      for (let i = 0; i < 48; i++) {
        state = tick(state);
      }

      return 100 - state.resources.water;
    };

    const lossNone = runWithLid('none');
    const lossMesh = runWithLid('mesh');
    const lossFull = runWithLid('full');
    const lossSealed = runWithLid('sealed');

    // No lid = most evaporation
    expect(lossNone).toBeGreaterThan(lossMesh);
    // Mesh > full
    expect(lossMesh).toBeGreaterThan(lossFull);
    // Full > sealed
    expect(lossFull).toBeGreaterThan(lossSealed);
    // Sealed = zero evaporation
    expect(lossSealed).toBe(0);
  });

  it('evaporation concentrates dissolved substances (same mass, less volume)', () => {
    // Set up a tank with some nitrate mass
    const initialNitrateMass = 200; // mg
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      heater: { enabled: false },
    });

    // Inject nitrate mass directly via produce
    state = produce(state, (draft) => {
      draft.resources.nitrate = initialNitrateMass;
    });

    const initialPpm = getPpm(state.resources.nitrate, state.resources.water);

    // Run ticks to allow evaporation
    for (let i = 0; i < 48; i++) {
      state = tick(state);
    }

    // Water should have decreased
    expect(state.resources.water).toBeLessThan(100);

    // The nitrate mass may change slightly due to nitrogen cycle activity,
    // but concentration should increase because volume decreased more significantly.
    const finalPpm = getPpm(state.resources.nitrate, state.resources.water);

    // With 200 mg nitrate in the tank, any nitrogen cycle contribution is negligible
    // compared to the concentration effect from volume loss.
    expect(finalPpm).toBeGreaterThan(initialPpm);
  });

  it('ATO compensates for evaporation (water level restored)', () => {
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 22,
      ato: { enabled: true },
    });

    // Run many ticks - ATO should keep water near capacity
    for (let i = 0; i < 72; i++) {
      state = tick(state);
    }

    // ATO triggers when water drops below 99% and restores to 100%.
    // After enough ticks, water should remain very close to capacity.
    expect(state.resources.water).toBeGreaterThanOrEqual(100 * 0.99);
  });

  it('ATO top-off dilutes concentrations back down', () => {
    // Start with nitrate in the tank
    const initialNitrateMass = 200; // mg
    const tankCapacity = 100;

    // First: run WITHOUT ATO to get a concentrated baseline
    let stateNoAto = createSimulation({
      tankCapacity,
      initialTemperature: 25,
      roomTemperature: 22,
      ato: { enabled: false },
      heater: { enabled: false },
    });
    stateNoAto = produce(stateNoAto, (draft) => {
      draft.resources.nitrate = initialNitrateMass;
    });

    // Then: run WITH ATO
    let stateWithAto = createSimulation({
      tankCapacity,
      initialTemperature: 25,
      roomTemperature: 22,
      ato: { enabled: true },
      heater: { enabled: false },
    });
    stateWithAto = produce(stateWithAto, (draft) => {
      draft.resources.nitrate = initialNitrateMass;
    });

    for (let i = 0; i < 72; i++) {
      stateNoAto = tick(stateNoAto);
      stateWithAto = tick(stateWithAto);
    }

    const ppmNoAto = getPpm(stateNoAto.resources.nitrate, stateNoAto.resources.water);
    const ppmWithAto = getPpm(stateWithAto.resources.nitrate, stateWithAto.resources.water);

    // Without ATO, volume drops and concentration spikes.
    // With ATO, volume stays near 100% so concentration stays lower.
    expect(ppmNoAto).toBeGreaterThan(ppmWithAto);

    // ATO keeps water near capacity, so concentration stays close to the original
    const originalPpm = initialNitrateMass / tankCapacity;
    expect(ppmWithAto).toBeCloseTo(originalPpm, 0);
  });
});

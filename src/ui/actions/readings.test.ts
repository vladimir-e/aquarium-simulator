import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createSimulation,
  MAX_SCRUB_PERCENT,
  MIN_SCRUB_PERCENT,
  type FishSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { blendTemperature } from '../../simulation/core/blending.js';
import { calculatePassiveResources } from '../../simulation/equipment/index.js';
import {
  HIGH_NITRATE_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
} from '../../simulation/alerts/index.js';
import { DEFAULT_SETTINGS, verbAction, verbDetail, type VerbDetail, type VerbId } from './verbs';
import { previewRows, type PreviewRow } from './readings';

/**
 * A tank parked where a broken preview would still look plausible: part full so
 * a top-off and a water change cannot be confused, nitrite already over the
 * line so its caveat has something to get wrong, a Betta pulling the tolerated
 * floor up to 24 °C that 18 °C tap will breach, and plants either side of the
 * middle trim rung.
 */
function fixture(species: FishSpecies[] = ['neon_tetra', 'corydoras', 'betta']): SimulationState {
  let state = createSimulation({
    tankCapacity: 200,
    tapWaterTemperature: 18,
    tapWaterPH: 7.4,
  });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculatePassiveResources(state).surface;

  state.resources.water = 196.4;
  state.resources.temperature = 25.4;
  state.resources.ph = 6.82;
  state.resources.ammonia = 0.034 * 196.4;
  state.resources.nitrite = 0.412 * 196.4;
  state.resources.nitrate = 18.6 * 196.4;
  state.resources.food = 0.12;
  state.algae.mass = 47;

  for (const s of species) {
    state = applyAction(state, { type: 'addFish', species: s }).state;
  }
  state = applyAction(state, { type: 'addPlant', species: 'java_fern' }).state;
  state = applyAction(state, { type: 'addPlant', species: 'anubias' }).state;
  expect(state.plants).toHaveLength(2);

  const sizes = [80, 60];
  return { ...state, plants: state.plants.map((plant, i) => ({ ...plant, size: sizes[i] })) };
}

function detail(state: SimulationState, id: VerbId, settings = DEFAULT_SETTINGS): VerbDetail {
  return verbDetail(state, id, settings, 'metric', DEFAULT_CONFIG);
}

function row(rows: PreviewRow[], key: string): PreviewRow {
  const found = rows.find((r) => r.key === key);
  expect(found, `no ${key} row`).toBeTruthy();
  return found as PreviewRow;
}

describe('preview readings', () => {
  it('prices a water change from the physics, not from a plausible-looking figure', () => {
    const state = fixture();
    const { capacity } = state.tank;
    const water = state.resources.water;
    const removed = water * 0.25;
    const remaining = water - removed;
    const added = capacity - remaining;

    const rows = detail(state, 'waterChange').preview;

    // Dissolved mass leaves in proportion; the tank then refills to capacity.
    expect(row(rows, 'nitrite').after).toBe(((state.resources.nitrite * 0.75) / capacity).toFixed(3));
    expect(row(rows, 'nitrate').after).toBe(((state.resources.nitrate * 0.75) / capacity).toFixed(1));
    // Temperature blends by heat capacity between what stayed and what came in.
    expect(row(rows, 'temperature').after).toBe(
      blendTemperature(25.4, remaining, 18, added).toFixed(1)
    );
    expect(row(rows, 'level').after).toBe('100');
    expect(row(rows, 'level').before).toBe('98');
  });

  it('shows the reading it started from, so before and after are the same scale', () => {
    const rows = detail(fixture(), 'waterChange').preview;

    expect(row(rows, 'nitrite').before).toBe('0.412');
    expect(row(rows, 'temperature').before).toBe('25.4');
    expect(row(rows, 'ph').before).toBe('6.82');
  });

  it.each<VerbId>(['feed', 'waterChange', 'topOff', 'dose', 'trimPlants'])(
    'promises what %s actually commits',
    (id) => {
      const state = fixture();
      // The action the sheet would dispatch, applied for real — a preview built
      // from a different amount than the commit sends is the failure this catches.
      const committed = applyAction(state, verbAction(id, DEFAULT_SETTINGS)).state;
      const landed = previewRows(state, [committed], 'metric');

      expect(detail(state, id).preview).toEqual(landed);
      expect(landed.length).toBeGreaterThan(0);
    }
  );

  it('dispatches the fraction the engine reads, not the percentage on the chip', () => {
    const state = fixture();
    const quarter = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;

    expect(detail(state, 'waterChange').preview).toEqual(previewRows(state, [quarter], 'metric'));
    // A 25 that meant 25× would be rejected outright and change nothing.
    expect(applyAction(state, { type: 'waterChange', amount: 25 }).state.resources.water).toBe(
      state.resources.water
    );
  });

  it('reports the dilution a top-off causes, not just the level it restores', () => {
    const state = fixture();
    const rows = detail(state, 'topOff').preview;

    expect(row(rows, 'nitrite').after).toBe(
      (state.resources.nitrite / state.tank.capacity).toFixed(3)
    );
    expect(row(rows, 'level').after).toBe('100');
    // Nothing tap-borne comes with it, so the blended readings hold.
    expect(rows.map((r) => r.key)).not.toContain('temperature');
    expect(rows.map((r) => r.key)).not.toContain('ph');
  });

  it('leaves out the readings an action does not move', () => {
    expect(detail(fixture(), 'feed').preview.map((r) => r.key)).toEqual(['food']);
  });

  it('previews a scrub as the range the engine rolls', () => {
    const state = fixture();
    const rows = detail(state, 'scrubAlgae').preview;
    const gentle = state.algae.mass * (1 - MIN_SCRUB_PERCENT);
    const hard = state.algae.mass * (1 - MAX_SCRUB_PERCENT);

    expect(row(rows, 'algae').after).toBe(`${hard.toFixed(0)}–${gentle.toFixed(0)}`);
    expect(rows).toHaveLength(1);
  });

  it('warns on temperature only where a stocked species minds', () => {
    const withBetta = detail(fixture(), 'waterChange').preview;
    // Same water, same tap, same 23.4 °C landing — a roster tolerating 22 °C.
    const withoutBetta = detail(fixture(['neon_tetra', 'corydoras']), 'waterChange').preview;

    expect(row(withBetta, 'temperature').after).toBe(row(withoutBetta, 'temperature').after);
    expect(row(withBetta, 'temperature').status).toBe('warn');
    expect(row(withBetta, 'temperature').note).toBe('below 24°C — heater recovers');
    expect(row(withoutBetta, 'temperature').status).toBe('neutral');
    expect(row(withoutBetta, 'temperature').note).toBeNull();
  });

  it('says a heater cannot recover a floor it is not set to hold', () => {
    const state = fixture();
    const cool = {
      ...state,
      equipment: {
        ...state.equipment,
        heater: { ...state.equipment.heater, targetTemperature: 23 },
      },
    };

    expect(row(detail(cool, 'waterChange').preview, 'temperature').note).toBe(
      'below 24°C — heater holds 23°C'
    );
  });

  it('says "still above" only where the engine’s line was already crossed', () => {
    const state = fixture();
    // A quarter off 1.6 ppm still lands over the alert line; the caveat persists.
    const cycling = {
      ...state,
      resources: { ...state.resources, nitrite: 1.6 * state.resources.water },
    };
    const nitrite = row(detail(cycling, 'waterChange').preview, 'nitrite');
    expect(nitrite.note).toBe(`still above ${HIGH_NITRITE_THRESHOLD.toFixed(2)}`);
    expect(nitrite.status).toBe('alert');

    // Nitrate crosses on the way up, so the caveat is news rather than a state.
    const loaded = {
      ...state,
      resources: {
        ...state.resources,
        nitrate: (HIGH_NITRATE_THRESHOLD - 0.2) * state.resources.water,
      },
    };
    const nitrate = row(detail(loaded, 'dose', { ...DEFAULT_SETTINGS, dose: 4 }).preview, 'nitrate');
    expect(nitrate.note).toBe(`above ${HIGH_NITRATE_THRESHOLD}`);
  });

  it('reads its lines off the engine, not off the sketch they were drawn from', () => {
    // The wireframe drew 0.25 ppm as the nitrite line; the engine's is 1.0, so
    // a 0.412 ppm tank is not in alert and the preview must not claim it is.
    const nitrite = row(detail(fixture(), 'waterChange').preview, 'nitrite');

    expect(nitrite.note).toBeNull();
    expect(nitrite.status).toBe('ok');
  });

  it('reads temperature in the reader’s own units', () => {
    const state = fixture();
    const metric = row(verbDetail(state, 'waterChange', DEFAULT_SETTINGS, 'metric', DEFAULT_CONFIG).preview, 'temperature');
    const imperial = row(verbDetail(state, 'waterChange', DEFAULT_SETTINGS, 'imperial', DEFAULT_CONFIG).preview, 'temperature');

    expect(metric.unit).toBe('°C');
    expect(metric.before).toBe('25.4');
    expect(imperial.unit).toBe('°F');
    expect(imperial.before).toBe('77.7');
    expect(imperial.note).toBe('below 75°F — heater recovers');
  });

  it('tracks the tank it is given, so a preview cannot go stale', () => {
    const state = fixture();
    const before = detail(state, 'waterChange').preview;

    const drained = { ...state, resources: { ...state.resources, water: 100 } };

    expect(row(detail(drained, 'waterChange').preview, 'level').before).toBe('50');
    expect(row(before, 'level').before).toBe('98');
  });
});

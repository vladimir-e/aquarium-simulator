import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createSimulation,
  getDosePreview,
  getPlantsToTrimCount,
  tick,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { calculatePassiveResources } from '../../simulation/equipment/index.js';
import {
  algaeRow,
  algaeStatus,
  algaeWord,
  doseDeltas,
  doseToCover,
  formatDose,
  nutrientAlert,
  nutrientReadings,
  plantRows,
  plantsAndAlgae,
  tankDemand,
  TRIM_TARGETS,
  trimTargets,
} from './flora';
import { conditionStatus, conditionWord } from './status';

const FORMULA = DEFAULT_CONFIG.nutrients.fertilizerFormula;

function tank(capacity = 200): SimulationState {
  const state = createSimulation({ tankCapacity: capacity });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculatePassiveResources(state).surface;
  return state;
}

function planted(species: PlantSpecies[], capacity = 200): SimulationState {
  const state = species.reduce(
    (current, s) => applyAction(current, { type: 'addPlant', species: s }).state,
    tank(capacity)
  );
  expect(state.plants).toHaveLength(species.length);
  return state;
}

/** Dose until a nutrient is present, the way a player would. */
function dosed(state: SimulationState, ml: number): SimulationState {
  return applyAction(state, { type: 'dose', amountMl: ml }).state;
}

describe('condition + algae words', () => {
  it('maps plant condition to status and word', () => {
    expect(conditionStatus(20)).toBe('alert');
    expect(conditionStatus(45)).toBe('warn');
    expect(conditionStatus(90)).toBe('ok');
    expect(conditionWord(5)).toBe('dying');
    expect(conditionWord(50)).toBe('fair');
    expect(conditionWord(95)).toBe('thriving');
  });

  it('maps algae mass to status and word (low is good)', () => {
    expect(algaeStatus(10)).toBe('ok');
    expect(algaeStatus(45)).toBe('warn');
    expect(algaeStatus(90)).toBe('alert');
    expect(algaeWord(1)).toBe('suppressed');
    expect(algaeWord(70)).toBe('spreading');
    expect(algaeWord(95)).toBe('booming');
  });
});

describe('plantRows', () => {
  it('carries the engine’s own vitality, and its factors sum to the net it prints', () => {
    let state = planted(['java_fern', 'monte_carlo']);
    for (let hour = 0; hour < 24; hour++) state = tick(state, DEFAULT_CONFIG);

    const rows = plantRows(state, DEFAULT_CONFIG);
    expect(rows.map((row) => row.name)).toEqual(['Java Fern', 'Monte Carlo']);

    for (const row of rows) {
      const benefits = row.benefits.reduce((sum, f) => sum + f.amount, 0);
      const stressors = row.stressors.reduce((sum, f) => sum + f.amount, 0);
      expect(row.net).toBeCloseTo(benefits - stressors, 6);
    }
  });

  it('names the plant declining and the plant thriving', () => {
    const state = planted(['java_fern']);
    const struggling = {
      ...state,
      plants: state.plants.map((p) => ({ ...p, condition: 22 })),
    };

    expect(plantRows(state, DEFAULT_CONFIG)[0].word).toBe('thriving');
    expect(plantRows(struggling, DEFAULT_CONFIG)[0]).toMatchObject({
      word: 'struggling',
      status: 'alert',
    });
  });
});

describe('algaeRow', () => {
  it('reads the engine’s algae population, not the plants’', () => {
    let state = planted(['java_fern']);
    state = applyAction(state, { type: 'feed', amount: 2 }).state;
    for (let hour = 0; hour < 24 * 5; hour++) state = tick(state, DEFAULT_CONFIG);

    const row = algaeRow(state, DEFAULT_CONFIG);
    expect(row.mass).toBe(state.algae.mass);
    const benefits = row.benefits.reduce((sum, f) => sum + f.amount, 0);
    const stressors = row.stressors.reduce((sum, f) => sum + f.amount, 0);
    expect(row.net).toBeCloseTo(benefits - stressors, 6);
  });
});

describe('nutrientReadings', () => {
  it('reads every nutrient against what the tank’s hungriest plant needs', () => {
    const state = planted(['java_fern', 'monte_carlo']);
    expect(tankDemand(state)).toBe('high');

    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    expect(readings.map((r) => r.label)).toEqual(['NO₃', 'PO₄', 'K', 'Fe']);
    // High demand is the engine's full optimal; every reading starts at zero.
    expect(readings.map((r) => r.needed)).toEqual([15, 1, 7, 0.15]);
    expect(readings.every((r) => r.ppm === 0 && r.fill === 0)).toBe(true);
  });

  it('scales the need down for a tank of low-demand plants', () => {
    const state = planted(['java_fern', 'anubias']);
    expect(tankDemand(state)).toBe('low');
    // lowDemandMultiplier is 0.3 of optimal.
    expect(nutrientReadings(state, DEFAULT_CONFIG)[0].needed).toBeCloseTo(4.5, 6);
  });

  it('only calls a nutrient short when the engine would actually feed a plant better', () => {
    // Everything a plant could want except iron — the classic deficiency.
    const noIron = (state: SimulationState): SimulationState => ({
      ...state,
      resources: {
        ...state.resources,
        nitrate: state.resources.water * 20,
        phosphate: state.resources.water * 2,
        potassium: state.resources.water * 10,
      },
    });
    const short = (state: SimulationState): string[] =>
      nutrientReadings(state, DEFAULT_CONFIG)
        .filter((r) => r.limiting)
        .map((r) => r.key);

    // Iron is a booster for a low-demand fern: the engine's sufficiency is
    // already 1 without it, so the panel does not cry deficiency.
    expect(short(noIron(planted(['java_fern'])))).toEqual([]);
    // A high-demand carpet requires all four, so the same water is short.
    expect(short(noIron(planted(['monte_carlo'])))).toEqual(['iron']);
  });

  it('has nothing to be short of when nothing is planted', () => {
    const readings = nutrientReadings(tank(), DEFAULT_CONFIG);
    expect(tankDemand(tank())).toBeNull();
    expect(readings.map((r) => r.neededText)).toEqual(['—', '—', '—', '—']);
    expect(nutrientAlert(readings)).toBeNull();
  });

  it('fills each track against that need and stops at full', () => {
    const state = dosed(planted(['monte_carlo']), 4);
    const [nitrate] = nutrientReadings(state, DEFAULT_CONFIG);
    expect(nitrate.ppm).toBeLessThan(nitrate.needed);
    expect(nitrate.fill).toBeCloseTo(nitrate.ppm / nitrate.needed, 6);

    const flooded = dosed(dosed(dosed(state, 50), 50), 50);
    expect(nutrientReadings(flooded, DEFAULT_CONFIG)[0].ppm).toBeGreaterThan(15);
    expect(nutrientReadings(flooded, DEFAULT_CONFIG)[0].fill).toBe(1);
  });
});

describe('nutrientAlert', () => {
  it('names the single deficiency, and says once when nothing is dosed at all', () => {
    const bare = nutrientReadings(planted(['monte_carlo']), DEFAULT_CONFIG);
    expect(nutrientAlert(bare)).toEqual({ text: 'nothing dosed', status: 'alert' });

    const state = planted(['monte_carlo']);
    const fed = {
      ...state,
      resources: {
        ...state.resources,
        nitrate: state.resources.water * 20,
        phosphate: state.resources.water * 2,
        potassium: state.resources.water * 10,
      },
    };
    expect(nutrientAlert(nutrientReadings(fed, DEFAULT_CONFIG))).toEqual({
      text: 'Fe depleted',
      status: 'alert',
    });
  });

  it('counts them instead of naming them when several are short', () => {
    const state = planted(['monte_carlo']);
    const partly = {
      ...state,
      resources: { ...state.resources, nitrate: state.resources.water * 20 },
    };
    // Nitrate met, the other three present but under a high-demand plant's need.
    const dosedALittle = dosed(partly, 4);
    expect(nutrientAlert(nutrientReadings(dosedALittle, DEFAULT_CONFIG))).toEqual({
      text: '3 nutrients low',
      status: 'warn',
    });
  });
});

describe('dose arithmetic', () => {
  it('previews against the engine’s own preview, at the tank’s live volume', () => {
    let state = planted(['monte_carlo']);
    for (let hour = 0; hour < 24 * 20; hour++) state = tick(state, DEFAULT_CONFIG);

    // Evaporation has run: the basis is the water in the tank, not its capacity.
    const water = state.resources.water;
    expect(water).toBeLessThan(state.tank.capacity);

    const preview = getDosePreview(2, water, FORMULA);
    expect(formatDose(doseDeltas(2, water, FORMULA))).toBe(
      `+${preview.nitratePpm.toFixed(1)} NO₃ · +${preview.phosphatePpm.toFixed(2)} PO₄ · ` +
        `+${preview.potassiumPpm.toFixed(1)} K · +${preview.ironPpm.toFixed(2)} Fe`
    );
  });

  it('recommends a dose that actually clears the deficit when the engine applies it', () => {
    const state = planted(['monte_carlo'], 40);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(advice).toEqual({ ml: 12, overSingleDose: false });

    const after = dosed(state, advice?.ml ?? 0);
    expect(nutrientReadings(after, DEFAULT_CONFIG).some((r) => r.limiting)).toBe(false);

    const under = dosed(state, (advice?.ml ?? 0) - 1);
    expect(nutrientReadings(under, DEFAULT_CONFIG).some((r) => r.limiting)).toBe(true);
  });

  it('says when covering the deficit takes more than one dose', () => {
    const state = planted(['monte_carlo']);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    // 200 L of empty water needs 60 ml; a single dose action stops at 50.
    expect(advice).toEqual({ ml: 60, overSingleDose: true });
    expect(applyAction(state, { type: 'dose', amountMl: 60 }).state.resources.nitrate).toBe(0);
  });

  it('has nothing to recommend once every nutrient is met', () => {
    const state = dosed(planted(['java_fern'], 40), 4);
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    expect(readings.every((r) => !r.limiting)).toBe(true);
    expect(doseToCover(readings, state, DEFAULT_CONFIG)).toBeNull();
  });
});

describe('trim targets', () => {
  it('offers only targets a plant in a calibrated tank can reach', () => {
    expect(TRIM_TARGETS).toEqual([50, 75, 85]);

    // Species peak between 50 % and ~105 % in the engine's own calibration, so
    // the top rung has to sit inside that band to ever be reachable.
    const grown = applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 90,
    }).state;

    const targets = trimTargets(grown);
    expect(targets.every((t) => !t.disabled)).toBe(true);
    expect(targets.map((t) => t.count)).toEqual(TRIM_TARGETS.map((t) => getPlantsToTrimCount(grown, t)));
  });

  it('disables the targets no plant is above', () => {
    const fresh = planted(['monte_carlo']);
    expect(fresh.plants[0].size).toBe(50);
    expect(trimTargets(fresh).map((t) => t.disabled)).toEqual([true, true, true]);
  });

  it('trims to every offered target through the engine', () => {
    const grown = applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 90,
    }).state;

    for (const { target } of trimTargets(grown)) {
      const trimmed = applyAction(grown, { type: 'trimPlants', targetSize: target }).state;
      expect(trimmed.plants[0].size).toBe(target);
    }
  });
});

describe('plantsAndAlgae', () => {
  it('counts plants against the tank’s capacity and reads the algae', () => {
    expect(plantsAndAlgae(tank(40))).toBe('0 of 6 plants · no algae');

    const state = planted(['java_fern'], 40);
    expect(plantsAndAlgae({ ...state, algae: { ...state.algae, mass: 47 } })).toBe(
      '1 of 6 plants · algae 47 %'
    );
  });
});

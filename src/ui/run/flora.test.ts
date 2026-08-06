import { describe, it, expect } from 'vitest';
import {
  applyAction,
  calculateSurface,
  createSimulation,
  getDosePreview,
  getPlantsToTrimCount,
  tick,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  ailingPlants,
  algaeRow,
  algaeStatus,
  algaeWord,
  doseDeltas,
  doseToCover,
  formatDose,
  nutrientAlert,
  nutrientReadings,
  overTrimCount,
  plantRows,
  plantsAndAlgae,
  tankDemand,
  TRIM_TARGETS,
} from './flora';
import { conditionStatus, conditionWord } from './status';

const FORMULA = DEFAULT_CONFIG.nutrients.fertilizerFormula;

function tank(capacity = 200): SimulationState {
  const state = createSimulation({ tankCapacity: capacity });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculateSurface(state);
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

describe('ailingPlants', () => {
  it('takes every plant off the ok band, worst first', () => {
    const state = planted(['java_fern', 'monte_carlo', 'anubias']);
    const conditions = [45, 90, 20];
    const mixed = {
      ...state,
      plants: state.plants.map((p, i) => ({ ...p, condition: conditions[i] })),
    };

    const ailing = ailingPlants(plantRows(mixed, DEFAULT_CONFIG));
    expect(ailing.map((row) => row.name)).toEqual(['Anubias', 'Java Fern']);
    expect(ailing.map((row) => row.word)).toEqual(['struggling', 'fair']);
  });

  it('has nothing to name while every plant is fine', () => {
    const state = planted(['java_fern']);
    expect(ailingPlants(plantRows(state, DEFAULT_CONFIG))).toEqual([]);
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
  it('spells the engine’s own preview at each nutrient’s precision, over the water given', () => {
    const preview = getDosePreview(2, 200, FORMULA);
    expect(formatDose(doseDeltas(2, 200, FORMULA))).toBe(
      `+${preview.nitratePpm.toFixed(1)} NO₃ · +${preview.phosphatePpm.toFixed(2)} PO₄ · ` +
        `+${preview.potassiumPpm.toFixed(1)} K · +${preview.ironPpm.toFixed(2)} Fe`
    );

    // The same dose is five times as strong in a fifth of the water.
    const strong = doseDeltas(2, 40, FORMULA);
    expect(strong.map((d) => d.text)).toEqual(['+2.5', '+0.25', '+2.0', '+0.05']);
  });

  it('recommends a dose that actually clears the deficit when the engine applies it', () => {
    const state = planted(['monte_carlo'], 40);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(advice).toEqual({
      ml: 12,
      overSingleDose: false,
      covers: ['NO₃', 'PO₄', 'K', 'Fe'],
    });

    const after = dosed(state, advice?.ml ?? 0);
    expect(nutrientReadings(after, DEFAULT_CONFIG).some((r) => r.limiting)).toBe(false);

    const under = dosed(state, (advice?.ml ?? 0) - 1);
    expect(nutrientReadings(under, DEFAULT_CONFIG).some((r) => r.limiting)).toBe(true);
  });

  it('says when covering the deficit takes more than one dose', () => {
    const state = planted(['monte_carlo']);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    // 200 L of empty water needs 60 ml; a single dose action stops at 50.
    expect(advice).toEqual({ ml: 60, overSingleDose: true, covers: ['NO₃', 'PO₄', 'K', 'Fe'] });
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

    // Plants go in at 50 % and a calibrated planted tank settles at 60–90 %, so
    // the top rung has to sit inside that band to ever be reachable.
    const grown = applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 90,
    }).state;

    expect(TRIM_TARGETS.map((t) => getPlantsToTrimCount(grown, t))).toEqual([1, 1, 1]);
  });

  it('has nothing to cut on a plant no rung is above', () => {
    const fresh = planted(['monte_carlo']);
    expect(fresh.plants[0].size).toBe(50);
    expect(TRIM_TARGETS.map((t) => getPlantsToTrimCount(fresh, t))).toEqual([0, 0, 0]);
  });

  it('trims to every offered target through the engine', () => {
    const grown = applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 90,
    }).state;

    for (const target of TRIM_TARGETS) {
      const trimmed = applyAction(grown, { type: 'trimPlants', targetSize: target }).state;
      expect(trimmed.plants[0].size).toBe(target);
    }
  });
});

describe('overTrimCount', () => {
  /** One plant of the given size, and nothing else growing. */
  function sized(size: number): SimulationState {
    return applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: size,
    }).state;
  }

  it('counts the plants every rung of the trim ladder would cut', () => {
    const ceiling = Math.max(...TRIM_TARGETS);

    // One point above the loosest rung is over; the rung itself is not.
    expect(overTrimCount(sized(ceiling + 1))).toBe(1);
    expect(overTrimCount(sized(ceiling))).toBe(0);
    // A plant the tighter rungs would still cut is not yet "too big".
    expect(overTrimCount(sized(80))).toBe(0);
    expect(getPlantsToTrimCount(sized(80), 75)).toBe(1);
  });

  it('flags the same plants on the row as it counts in the summary', () => {
    const big = sized(Math.max(...TRIM_TARGETS) + 1);
    expect(plantRows(big, DEFAULT_CONFIG).map((r) => r.overTrim)).toEqual([true]);

    const small = sized(60);
    expect(plantRows(small, DEFAULT_CONFIG).map((r) => r.overTrim)).toEqual([false]);
    expect(overTrimCount(small)).toBe(0);
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

  it('names the reason to trim once there is one', () => {
    const grown = applyAction(tank(40), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 95,
    }).state;

    expect(plantsAndAlgae(grown)).toBe('1 of 6 plants · no algae · 1 to trim');
    // Trimming to the loosest rung retires the clause it motivated.
    const trimmed = applyAction(grown, {
      type: 'trimPlants',
      targetSize: Math.max(...TRIM_TARGETS),
    }).state;
    expect(plantsAndAlgae(trimmed)).toBe('1 of 6 plants · no algae');
  });
});

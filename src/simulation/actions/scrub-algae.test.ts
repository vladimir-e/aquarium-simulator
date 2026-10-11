import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { onTheGlass, scrubAlgae } from './scrub-algae.js';
import { createSimulation, type SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankGlassSurface } from '../core/geometry.js';
import { bloomCoverage, habitatSize, placeShare } from '../algae/index.js';
import { bloomAt, bloomsTissue } from '../tests/blooms.js';
import { createHardscapeItem } from '../equipment/hardscape.js';
import { placeHardscape } from '../equipment/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { NUTRIENTS } from '../config/nutrients.js';
import { bloomParams } from '../flora/params.js';

const config = DEFAULT_CONFIG.plants;

/** A tank with this much film on its surfaces, and green water at `greenWater`. */
function withAlgae(film: number, greenWater = 0): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.algae.film = bloomAt(draft, 'film', film);
    draft.algae.greenWater = bloomAt(draft, 'greenWater', greenWater);
  });
}

describe('onTheGlass', () => {
  it('is each kind’s coverage times the walls’ share of its habitat', () => {
    const state = withAlgae(80, 40);
    const glass = onTheGlass(state);
    const walls = calculateTankGlassSurface(100) - calculateFloorArea(100);

    expect(glass.film).toBeCloseTo((80 * walls) / habitatSize('surfaces', state), 12);
    expect(glass.greenWater).toBe(0);
  });

  it('follows the hardscape: a piece on the bed leaves the walls a smaller share of the film', () => {
    const bare = withAlgae(80);
    const rocked = placeHardscape(bare, createHardscapeItem('rock', 'neutral_rock'));
    expect(placeShare('surfaces', 'walls', rocked)).toBeLessThan(placeShare('surfaces', 'walls', bare));
    expect(onTheGlass(rocked).film / bloomCoverage(rocked, 'film')).toBeCloseTo(placeShare('surfaces', 'walls', rocked), 12);
  });
});

describe('scrubAlgae', () => {
  it('takes the film on the glass and leaves what the rest of its habitat holds', () => {
    const state = withAlgae(80, 40);
    const scrubbed = scrubAlgae(state, config).state;

    expect(bloomCoverage(scrubbed, 'film')).toBeCloseTo(80 * (1 - placeShare('surfaces', 'walls', state)), 12);
    expect(scrubbed.algae.film.condition).toBe(state.algae.film.condition);
  });

  it('leaves green water in the column, however thick', () => {
    expect(scrubAlgae(withAlgae(30, 90), config).state.algae.greenWater).toEqual(withAlgae(30, 90).algae.greenWater);
  });

  it('leaves what it takes in the water: its tissue and reserve as waste at Q_min, its stores leached', () => {
    const state = withAlgae(80, 40);
    const scrubbed = scrubAlgae(state, config).state;
    const film = (s: SimulationState): number => s.algae.film.budget.structure + s.algae.film.budget.reserve;
    const p = bloomParams('film', config);
    const scraped = state.algae.film.budget.structure - scrubbed.algae.film.budget.structure;

    expect(scrubbed.resources.waste.grams).toBeCloseTo(state.resources.waste.grams + film(state) - film(scrubbed), 12);
    for (const n of NUTRIENTS) {
      expect(scrubbed.resources.waste.nutrients[n]).toBeCloseTo(state.resources.waste.nutrients[n] + p.qMin[n] * scraped, 12);
      expect(scrubbed.resources[n] - state.resources[n]).toBeCloseTo(
        state.algae.film.budget.stores[n] - scrubbed.algae.film.budget.stores[n],
        12
      );
    }
    expect(bloomsTissue(scrubbed)).toBeLessThan(bloomsTissue(state));
  });

  it('takes the same share again from what is left: a second scrub clears the glass of what the first left there', () => {
    const once = scrubAlgae(withAlgae(80), config).state;
    const twice = scrubAlgae(once, config).state;
    const kept = 1 - placeShare('surfaces', 'walls', once);
    expect(bloomCoverage(twice, 'film')).toBeCloseTo(80 * kept * kept, 12);
  });

  it('reports and logs what it removed and what is left', () => {
    const state = withAlgae(80);
    const result = scrubAlgae(state, config);
    const log = result.state.logs.at(-1)!;

    expect(result.message).toContain(onTheGlass(state).film.toFixed(1));
    expect(result.state.logs).toHaveLength(state.logs.length + 1);
    expect(log).toMatchObject({ source: 'scrub', severity: 'info' });
    expect(log.message).toContain(bloomCoverage(result.state, 'film').toFixed(1));
  });

  it('names where what is left lies: the places of the habitat off the glass', () => {
    const logged = (state: SimulationState): string => scrubAlgae(state, config).state.logs.at(-1)!.message;
    const bare = withAlgae(80);
    const rocked = placeHardscape(bare, createHardscapeItem('rock', 'neutral_rock'));

    expect(logged(bare)).toMatch(/left on the floor$/);
    expect(logged(rocked)).toMatch(/left on the floor and the hardscape$/);
  });

  it('draws nothing from the tank’s stream', () => {
    const state = withAlgae(80);
    expect(scrubAlgae(state, config).state.rng).toEqual(state.rng);
  });

  it('refuses a tank with nothing on the glass, and leaves it as it was', () => {
    const clean = withAlgae(0, 50);
    const result = scrubAlgae(clean, config);
    expect(result.state).toBe(clean);
    expect(result.message).toBe('Nothing on the glass to scrub');
  });

  it('does not modify the state it was given', () => {
    const state = withAlgae(100);
    scrubAlgae(state, config);
    expect(bloomCoverage(state, 'film')).toBeCloseTo(100, 12);
  });
});

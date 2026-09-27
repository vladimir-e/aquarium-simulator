import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { onTheGlass, scrubAlgae } from './scrub-algae.js';
import { createSimulation, type SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankGlassSurface } from '../core/geometry.js';
import { habitatSize, placeShare } from '../algae/index.js';
import { bloomsTissue } from '../tests/blooms.js';
import { createHardscapeItem } from '../equipment/hardscape.js';
import { placeHardscape } from '../equipment/index.js';

/** A tank with this much film on its surfaces, and green water at `greenWater`. */
function withAlgae(film: number, greenWater = 0): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.algae.film.mass = film;
    draft.algae.greenWater.mass = greenWater;
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
    expect(onTheGlass(rocked).film / rocked.algae.film.mass).toBeCloseTo(placeShare('surfaces', 'walls', rocked), 12);
  });
});

describe('scrubAlgae', () => {
  it('takes the film on the glass and leaves what the rest of its habitat holds', () => {
    const state = withAlgae(80, 40);
    const scrubbed = scrubAlgae(state).state;

    expect(scrubbed.algae.film.mass).toBeCloseTo(80 * (1 - placeShare('surfaces', 'walls', state)), 12);
    expect(scrubbed.algae.film.condition).toBe(state.algae.film.condition);
    expect(scrubbed.algae.film.surplus).toBe(state.algae.film.surplus);
  });

  it('leaves green water in the column, however thick', () => {
    expect(scrubAlgae(withAlgae(30, 90)).state.algae.greenWater).toEqual(withAlgae(30, 90).algae.greenWater);
  });

  it('leaves what it takes in the water as waste, so the tissue is kept', () => {
    const state = withAlgae(80, 40);
    const scrubbed = scrubAlgae(state).state;
    const tissue = (s: SimulationState): number => bloomsTissue(s) + s.resources.waste;

    expect(scrubbed.resources.waste).toBeGreaterThan(state.resources.waste);
    expect(tissue(scrubbed)).toBeCloseTo(tissue(state), 12);
  });

  it('takes the same share again from what is left: a second scrub clears the glass of what the first left there', () => {
    const once = scrubAlgae(withAlgae(80)).state;
    const twice = scrubAlgae(once).state;
    const kept = 1 - placeShare('surfaces', 'walls', once);
    expect(twice.algae.film.mass).toBeCloseTo(80 * kept * kept, 12);
  });

  it('reports and logs what it removed and what is left', () => {
    const state = withAlgae(80);
    const result = scrubAlgae(state);
    const log = result.state.logs.at(-1)!;

    expect(result.message).toContain(onTheGlass(state).film.toFixed(1));
    expect(result.state.logs).toHaveLength(state.logs.length + 1);
    expect(log).toMatchObject({ source: 'scrub', severity: 'info' });
    expect(log.message).toContain(result.state.algae.film.mass.toFixed(1));
  });

  it('names where what is left lies: the places of the habitat off the glass', () => {
    const logged = (state: SimulationState): string => scrubAlgae(state).state.logs.at(-1)!.message;
    const bare = withAlgae(80);
    const rocked = placeHardscape(bare, createHardscapeItem('rock', 'neutral_rock'));

    expect(logged(bare)).toMatch(/left on the floor$/);
    expect(logged(rocked)).toMatch(/left on the floor and the hardscape$/);
  });

  it('draws nothing from the tank’s stream', () => {
    const state = withAlgae(80);
    expect(scrubAlgae(state).state.rng).toEqual(state.rng);
  });

  it('refuses a tank with nothing on the glass, and leaves it as it was', () => {
    const clean = withAlgae(0, 50);
    const result = scrubAlgae(clean);
    expect(result.state).toBe(clean);
    expect(result.message).toBe('Nothing on the glass to scrub');
  });

  it('does not modify the state it was given', () => {
    const state = withAlgae(100);
    scrubAlgae(state);
    expect(state.algae.film.mass).toBe(100);
  });
});

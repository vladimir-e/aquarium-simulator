import { describe, it, expect } from 'vitest';
import {
  scrubAlgae,
  canScrubAlgae,
  MIN_SCRUB_PERCENT,
  MAX_SCRUB_PERCENT,
  MIN_ALGAE_TO_SCRUB,
} from './scrub-algae.js';
import { createSimulation, type SimulationState } from '../state.js';
import { ALGAE, bloomTissue, habitatSize } from '../algae/index.js';
import { produce } from 'immer';

/** A tank with this much film on its surfaces, and green water at `greenWater`. */
function withAlgae(mass: number, rngSeed?: number, greenWater = 0): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }, undefined, rngSeed), (draft) => {
    draft.algae.film.mass = mass;
    draft.algae.greenWater.mass = greenWater;
  });
}

describe('canScrubAlgae', () => {
  it('needs at least the minimum film', () => {
    expect(canScrubAlgae(withAlgae(0))).toBe(false);
    expect(canScrubAlgae(withAlgae(MIN_ALGAE_TO_SCRUB - 1))).toBe(false);
    expect(canScrubAlgae(withAlgae(MIN_ALGAE_TO_SCRUB))).toBe(true);
    expect(canScrubAlgae(withAlgae(100))).toBe(true);
  });

  it('finds nothing to scrape in green water, however thick', () => {
    expect(canScrubAlgae(withAlgae(0, undefined, 100))).toBe(false);
  });
});

describe('scrubAlgae', () => {
  it('leaves too little algae alone', () => {
    const state = withAlgae(MIN_ALGAE_TO_SCRUB - 1);
    const result = scrubAlgae(state, { type: 'scrubAlgae' });

    expect(result.state.algae).toEqual(state.algae);
    expect(result.message).toContain('too low');
  });

  it.each([MIN_SCRUB_PERCENT, 0.2, MAX_SCRUB_PERCENT])('removes %d of the film, and leaves the green water', (randomPercent) => {
    const result = scrubAlgae(withAlgae(80, undefined, 40), { type: 'scrubAlgae', randomPercent });
    expect(result.state.algae.film.mass).toBeCloseTo(80 * (1 - randomPercent), 10);
    expect(result.state.algae.greenWater.mass).toBe(40);
  });

  it('leaves what it takes in the water as waste, so the tissue is kept', () => {
    const state = withAlgae(80);
    const scrubbed = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.25 }).state;
    const tissue = (s: SimulationState): number =>
      bloomTissue(s.algae.film.mass, habitatSize('surfaces', s), ALGAE.film) + s.resources.waste;

    expect(scrubbed.resources.waste).toBeGreaterThan(state.resources.waste);
    expect(tissue(scrubbed)).toBeCloseTo(tissue(state), 12);
  });

  it('reports and logs what it removed and what is left', () => {
    const state = withAlgae(100);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });
    const log = result.state.logs.at(-1)!;

    expect(result.message).toContain('20.0');
    expect(result.message).toContain('20%');
    expect(result.state.logs).toHaveLength(state.logs.length + 1);
    expect(log).toMatchObject({ source: 'scrub', severity: 'info' });
    expect(log.message).toContain('removed');
    expect(log.message).toContain('80.0');
  });

  it('does not modify the state it was given', () => {
    const state = withAlgae(100);
    scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });
    expect(state.algae.film.mass).toBe(100);
  });

  describe('random bite', () => {
    it('stays within the documented band across a run of scrubs', () => {
      let state = withAlgae(100, 4242);
      const bites: number[] = [];
      for (let i = 0; i < 200; i++) {
        state = scrubAlgae(state, { type: 'scrubAlgae' }).state;
        bites.push(1 - state.algae.film.mass / 100);
        state = produce(state, (draft) => {
          draft.algae.film.mass = 100;
        });
      }

      expect(Math.min(...bites)).toBeGreaterThanOrEqual(MIN_SCRUB_PERCENT);
      expect(Math.max(...bites)).toBeLessThanOrEqual(MAX_SCRUB_PERCENT);
      expect(new Set(bites).size).toBeGreaterThan(1);
    });

    it('takes the same bite out of two tanks on one rng seed', () => {
      const scrub = (rngSeed: number): number =>
        scrubAlgae(withAlgae(100, rngSeed), { type: 'scrubAlgae' }).state.algae.film.mass;

      expect(scrub(4242)).toBe(scrub(4242));
      expect(scrub(4242)).not.toBe(scrub(99));
    });

    it('spends one draw, and only when it rolls the bite itself', () => {
      const state = withAlgae(100, 4242);

      expect(scrubAlgae(state, { type: 'scrubAlgae' }).state.rng.counter).toBe(state.rng.counter + 1);
      expect(scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 }).state.rng).toEqual(state.rng);
      expect(scrubAlgae(withAlgae(4, 4242), { type: 'scrubAlgae' }).state.rng).toEqual(
        withAlgae(4, 4242).rng
      );
    });
  });

  it('refuses a percent outside the documented bite', () => {
    const state = withAlgae(50);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: NaN });

    expect(result.state).toBe(state);
    expect(result.message).toBe(
      `Scrub percent must be between ${MIN_SCRUB_PERCENT} and ${MAX_SCRUB_PERCENT}`
    );
    expect(scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.9 }).state).toBe(state);
    expect(scrubAlgae(state, { type: 'scrubAlgae', randomPercent: -1 }).state).toBe(state);
  });
});

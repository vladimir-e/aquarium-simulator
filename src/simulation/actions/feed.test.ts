import { describe, it, expect } from 'vitest';
import { feed } from './feed.js';
import { createSimulation } from '../state.js';
import { DEFAULT_CONFIG, withTunable } from '../config/index.js';
import { atRecipe } from '../core/organics.js';
import { tick } from '../tick.js';
import { organicsCloseTo } from '../tests/organics.js';

describe('feed action', () => {
  it('creates positive food effect with specified amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.5 }, DEFAULT_CONFIG);

    expect(result.state.resources.food.grams).toBe(0.5);
  });

  it('drops food at the recipe food has at the feeding, which a later change of recipe leaves alone', () => {
    const richer = withTunable(DEFAULT_CONFIG, 'livestock.foodCarbonFraction', 0.5);
    const fed = feed(createSimulation({ tankCapacity: 100 }), { type: 'feed', amount: 0.5 }, DEFAULT_CONFIG).state;
    const later = tick(fed, richer).resources.food;

    expect(fed.resources.food).toEqual(atRecipe(0.5, DEFAULT_CONFIG));
    expect(later.grams).toBeLessThan(0.5);
    expect(later).toEqual(organicsCloseTo(atRecipe(later.grams, DEFAULT_CONFIG), 12));
  });

  it('adds to existing food amount', () => {
    let state = createSimulation({ tankCapacity: 100 });
    state = feed(state, { type: 'feed', amount: 0.5 }, DEFAULT_CONFIG).state;
    state = feed(state, { type: 'feed', amount: 0.3 }, DEFAULT_CONFIG).state;

    expect(state.resources.food.grams).toBeCloseTo(0.8, 2);
  });

  it('returns message with correct amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.5 }, DEFAULT_CONFIG);

    expect(result.message).toContain('0.50g');
  });

  it('logs with correct message', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.5 }, DEFAULT_CONFIG);

    const feedLog = result.state.logs.find(
      (log) => log.source === 'user' && log.message.includes('Fed')
    );
    expect(feedLog).toBeDefined();
    expect(feedLog!.message).toContain('0.50g');
    expect(feedLog!.severity).toBe('info');
  });

  it('rejects zero amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0 }, DEFAULT_CONFIG);

    expect(result.state.resources.food.grams).toBe(0);
    expect(result.message).toContain('Cannot feed');
  });

  it('adds the whole feeding to the stock, rounding only what it says', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const fed = feed(state, { type: 'feed', amount: 0.123 }, DEFAULT_CONFIG);
    const pinch = feed(fed.state, { type: 'feed', amount: 0.003 }, DEFAULT_CONFIG);

    expect(fed.state.resources.food.grams).toBe(0.123);
    expect(fed.message).toBe('Added 0.12g of food');
    expect(pinch.state.resources.food.grams).toBeCloseTo(0.126, 12);
  });

  describe('non-finite amounts', () => {
    it('refuses food that is not a number, and says so', () => {
      const state = createSimulation({ tankCapacity: 100 });
      const result = feed(state, { type: 'feed', amount: NaN }, DEFAULT_CONFIG);

      expect(result.state).toBe(state);
      expect(result.message).toBe('Feed amount must be a number');
    });

    it('refuses an unbounded feeding', () => {
      const state = createSimulation({ tankCapacity: 100 });

      expect(feed(state, { type: 'feed', amount: Infinity }, DEFAULT_CONFIG).state).toBe(state);
      expect(feed(state, { type: 'feed', amount: -Infinity }, DEFAULT_CONFIG).state).toBe(state);
    });
  });
});

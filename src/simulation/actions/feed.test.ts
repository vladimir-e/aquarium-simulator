import { describe, it, expect } from 'vitest';
import { feed } from './feed.js';
import { createSimulation } from '../state.js';

describe('feed action', () => {
  it('creates positive food effect with specified amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.5 });

    expect(result.state.resources.food).toBe(0.5);
  });

  it('adds to existing food amount', () => {
    let state = createSimulation({ tankCapacity: 100 });
    state = feed(state, { type: 'feed', amount: 0.5 }).state;
    state = feed(state, { type: 'feed', amount: 0.3 }).state;

    expect(state.resources.food).toBeCloseTo(0.8, 2);
  });

  it('handles different amounts (0.1g, 0.5g, 2.0g)', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const result1 = feed(state, { type: 'feed', amount: 0.1 });
    expect(result1.state.resources.food).toBe(0.1);

    const result2 = feed(state, { type: 'feed', amount: 0.5 });
    expect(result2.state.resources.food).toBe(0.5);

    const result3 = feed(state, { type: 'feed', amount: 2.0 });
    expect(result3.state.resources.food).toBe(2.0);
  });

  it('returns message with correct amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.5 });

    expect(result.message).toContain('0.5g');
  });

  it('logs with correct message', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.5 });

    const feedLog = result.state.logs.find(
      (log) => log.source === 'user' && log.message.includes('Fed')
    );
    expect(feedLog).toBeDefined();
    expect(feedLog!.message).toContain('0.5g');
    expect(feedLog!.severity).toBe('info');
  });

  it('rejects zero amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0 });

    expect(result.state.resources.food).toBe(0);
    expect(result.message).toContain('Cannot feed');
  });

  it('rejects negative amount', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: -1 });

    expect(result.state.resources.food).toBe(0);
    expect(result.message).toContain('Cannot feed');
  });

  it('maintains 2 decimal precision', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = feed(state, { type: 'feed', amount: 0.123 });

    // Should be rounded to 2 decimal places
    expect(result.state.resources.food).toBeCloseTo(0.12, 2);
  });
});

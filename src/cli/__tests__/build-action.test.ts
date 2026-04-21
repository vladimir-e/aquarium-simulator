import { describe, it, expect } from 'vitest';
import { buildAction } from '../sim.js';

describe('buildAction waterChange', () => {
  it('accepts arbitrary percent (40)', () => {
    const action = buildAction('waterChange', ['40']);
    expect(action).toEqual({ type: 'waterChange', amount: 0.4 });
  });

  it('accepts arbitrary fraction (0.4)', () => {
    const action = buildAction('waterChange', ['0.4']);
    expect(action).toEqual({ type: 'waterChange', amount: 0.4 });
  });

  it('accepts the UI preset steps unchanged', () => {
    for (const pct of [10, 25, 50, 90]) {
      const action = buildAction('waterChange', [String(pct)]);
      expect(action).toEqual({ type: 'waterChange', amount: pct / 100 });
    }
  });

  it('defaults to 25% when no arg is supplied', () => {
    const action = buildAction('waterChange', []);
    expect(action).toEqual({ type: 'waterChange', amount: 0.25 });
  });

  it('accepts exactly 100%', () => {
    const action = buildAction('waterChange', ['100']);
    expect(action).toEqual({ type: 'waterChange', amount: 1 });
  });

  it('rejects zero', () => {
    expect(() => buildAction('waterChange', ['0'])).toThrow(/fraction|percentage/);
  });

  it('rejects negative', () => {
    expect(() => buildAction('waterChange', ['-1'])).toThrow(/fraction|percentage/);
  });

  it('rejects values above 100%', () => {
    expect(() => buildAction('waterChange', ['150'])).toThrow(/100%/);
  });

  it('rejects non-numeric input', () => {
    expect(() => buildAction('waterChange', ['half'])).toThrow(/fraction|percentage/);
  });
});

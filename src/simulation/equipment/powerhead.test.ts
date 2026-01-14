import { describe, it, expect } from 'vitest';
import { getPowerheadFlow, POWERHEAD_FLOW_LPH } from './powerhead.js';

describe('getPowerheadFlow', () => {
  it('converts 240 GPH to 908 L/h', () => {
    expect(getPowerheadFlow(240)).toBe(908);
  });

  it('converts 400 GPH to 1514 L/h', () => {
    expect(getPowerheadFlow(400)).toBe(1514);
  });

  it('converts 600 GPH to 2271 L/h', () => {
    expect(getPowerheadFlow(600)).toBe(2271);
  });

  it('converts 850 GPH to 3218 L/h', () => {
    expect(getPowerheadFlow(850)).toBe(3218);
  });

  it('matches POWERHEAD_FLOW_LPH constants', () => {
    expect(getPowerheadFlow(240)).toBe(POWERHEAD_FLOW_LPH[240]);
    expect(getPowerheadFlow(400)).toBe(POWERHEAD_FLOW_LPH[400]);
    expect(getPowerheadFlow(600)).toBe(POWERHEAD_FLOW_LPH[600]);
    expect(getPowerheadFlow(850)).toBe(POWERHEAD_FLOW_LPH[850]);
  });
});

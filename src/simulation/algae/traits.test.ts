import { describe, it, expect } from 'vitest';
import { ALGAE_KINDS, bloomMass } from './index.js';
import { bloomParams } from '../flora/params.js';
import { processFlora } from '../flora/index.js';
import { applyAction } from '../actions/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { sum } from '../core/sum.js';
import { stocked } from '../systems/flora-budget.js';
import type { Plant, SimulationState } from '../state.js';
import { DARK, floraTank, grow, hoursUntil, litDay, runFlora } from '../tests/flora.js';
import { plantRecord } from '../tests/plant.js';

const config = DEFAULT_CONFIG;

const planting = (): Plant[] =>
  [0, 1].map((i) => plantRecord({ id: `sword${i}`, species: 'amazon_sword', size: 50 }));

describe.each(ALGAE_KINDS)('%s on its energy budget', (kind) => {
  it('puts everything its reserve releases past maintenance into structure, keeping no buffer', () => {
    const p = bloomParams(kind, config.plants);
    const { states, fluxes } = grow(p, stocked(1, p), HOURS_PER_DAY);
    expect(states.every(({ offshootBuffer }) => offshootBuffer === 0)).toBe(true);
    for (const f of fluxes) expect(f.mobilised).toBeCloseTo(f.burned.maintenance + f.burned.growth + f.toStructure, 12);
    expect(sum(fluxes.map((f) => f.toStructure))).toBeGreaterThan(0);
  });

  it('is held by a thriving planting’s exudates, and by none in a bare tank', () => {
    const exudates = (plants: Plant[]): number =>
      processFlora(floraTank({ plants, algae: { [kind]: 10 } }), config).algae[kind].exudates;
    expect(exudates(planting())).toBeLessThan(1);
    expect(exudates([])).toBe(1);
  });

  it('dies back in the dark, spores and all, and regrows from them once the light returns', () => {
    const dark = runFlora(floraTank({ algae: { [kind]: 10 } }), 60 * HOURS_PER_DAY, DARK);
    const coverage = dark.hours.map(({ state }) => bloomMass(state, kind));
    const dieBack = hoursUntil(dark.hours, (hour) => hour.algae[kind].vitality.newCondition <= 0);
    const darkest = Math.max(...coverage.slice(dieBack));
    expect(dieBack).toBeLessThan(Infinity);
    expect(darkest).toBeLessThan(coverage[0] / 10);
    expect(bloomMass(runFlora(dark.state, 30 * HOURS_PER_DAY, litDay(60)).state, kind)).toBeGreaterThan(10 * darkest);
  });
});

describe('film on the glass of a planted tank', () => {
  const scrubbedWeekly = (state: SimulationState, hour: number): SimulationState =>
    (hour + 1) % (7 * HOURS_PER_DAY) === 0 ? applyAction(state, { type: 'scrubAlgae' }, config).state : state;
  const coverage = (days: number, keep?: typeof scrubbedWeekly): number[] =>
    runFlora(floraTank({ plants: planting() }), days * HOURS_PER_DAY, litDay(60), keep).hours.map(({ state }) =>
      bloomMass(state, 'film')
    );

  it('films past 1 % within one to two weeks unscrubbed, and stays under it scrubbed weekly', () => {
    const days = hoursUntil(coverage(21), (mass) => mass > 1) / HOURS_PER_DAY;
    expect(days).toBeGreaterThan(7);
    expect(days).toBeLessThanOrEqual(14);
    expect(Math.max(...coverage(70, scrubbedWeekly))).toBeLessThan(1);
  });
});

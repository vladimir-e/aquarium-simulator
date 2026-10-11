import { describe, it, expect } from 'vitest';
import { ALGAE_KINDS, bloomMass } from './index.js';
import { bloomParams } from '../flora/params.js';
import { applyAction } from '../actions/index.js';
import { BLOOM_VISIBLE_LINE } from '../alerts/bloom.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { sum } from '../core/sum.js';
import { stocked } from '../systems/flora-budget.js';
import type { Plant, SimulationState } from '../state.js';
import { DARK, floraTank, grow, litDay, runFlora } from '../tests/flora.js';
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

  it('dies back in the dark and logs it once — the spores that land after starve unseen — and regrows once relit', () => {
    const dark = runFlora(floraTank({ algae: { [kind]: 10 } }), 60 * HOURS_PER_DAY, DARK);
    const dieBacks = dark.hours.filter((hour) => hour.algae[kind].vitality.newCondition <= 0);
    expect(dieBacks.length).toBeGreaterThan(1);
    expect(dark.state.logs.filter((log) => log.event === 'algae-died')).toHaveLength(1);
    expect(bloomMass(dark.state, kind)).toBeLessThan(BLOOM_VISIBLE_LINE);
    expect(bloomMass(runFlora(dark.state, 30 * HOURS_PER_DAY, litDay(60)).state, kind)).toBeGreaterThan(BLOOM_VISIBLE_LINE);
  });
});

describe('film on the glass of a planted tank', () => {
  const WEEK = 7 * HOURS_PER_DAY;
  const scrubbedWeekly = (state: SimulationState, hour: number): SimulationState =>
    (hour + 1) % WEEK === 0 ? applyAction(state, { type: 'scrubAlgae' }, config).state : state;
  const coverage = (weeks: number, keep?: typeof scrubbedWeekly): number[] =>
    runFlora(floraTank({ plants: planting() }), weeks * WEEK, litDay(60), { keep }).hours.map(({ state }) =>
      bloomMass(state, 'film')
    );

  it('is held by weekly scrubbing under where it stands unscrubbed at two weeks, its weekly peaks cresting and never climbing again', () => {
    const scrubbed = coverage(10, scrubbedWeekly);
    const peaks = Array.from({ length: 10 }, (_, week) => Math.max(...scrubbed.slice(week * WEEK, (week + 1) * WEEK)));
    const crest = peaks.indexOf(Math.max(...peaks));
    expect(Math.max(...scrubbed)).toBeLessThan(coverage(2).at(-1)!);
    expect(crest).toBeLessThan(peaks.length - 1);
    expect(peaks.slice(crest).every((peak, i, after) => i === 0 || peak <= after[i - 1])).toBe(true);
  });
});

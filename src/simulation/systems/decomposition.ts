/**
 * Decomposition — one law for every organic pool. Food, standing waste and the
 * bed's mulm each rot first order on what they hold, paced by temperature and
 * by oxygen, and food and waste settle into the bed beside it.
 * Runs in PASSIVE tier.
 *
 * Rot runs two paths. The aerobic one saturates on dissolved oxygen; the
 * anaerobic one runs on the share oxygen leaves, slower by `anaerobicShare`,
 * so a pool rots on in anoxic water but holds its carbon longer. Rot takes a
 * pool pro-rata, so the pool keeps its composition as it goes: its carbon
 * leaves as CO2, the aerobic share drawing the oxygen a carbohydrate's carbon
 * takes, and its nitrogen comes out as ammonia and its minerals to the water.
 */

import type { Effect } from '../core/effects.js';
import type { Resources, SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import type { OrganicResourceKey } from '../resources/types.js';
import { ORGANIC_POOLS, decompositionDefaults, type DecompositionConfig } from '../config/decomposition.js';
import { hourlyDraws, monodFactor, q10Factor } from '../core/kinetics.js';
import { C_TO_CO2_MASS_RATIO, C_TO_O2_MASS_RATIO } from '../core/chemistry.js';
import { scaleOrganics, sumOrganics, type Organics } from '../core/organics.js';
import { getPpm } from '../resources/helpers.js';
import { mineralise } from './nitrogen-cycle.js';

export type DecomposingTank = Pick<SimulationState, 'resources' | 'equipment'>;

/** How fast rot runs at this temperature, against the reference its rates are quoted at. */
export function rotPace(temperature: number, config: DecompositionConfig = decompositionDefaults): number {
  return q10Factor(temperature, config.q10, config.referenceTemp);
}

/** The rate, per hour, a pool rots at along each path: aerobic on the oxygen there is, anaerobic on the share it leaves. */
export function rotRates(
  pool: OrganicResourceKey,
  water: Pick<Resources, 'temperature' | 'oxygen'>,
  config: DecompositionConfig = decompositionDefaults
): { aerobic: number; anaerobic: number } {
  const rate = config.rate[pool] * rotPace(water.temperature, config);
  const oxic = monodFactor(water.oxygen, config.oxygenHalfSaturation);
  return { aerobic: rate * oxic, anaerobic: rate * config.anaerobicShare * (1 - oxic) };
}

/**
 * The rate, per hour, what hangs in the water settles into the bed. Flow keeps
 * particles in suspension, so it halves at `settlingHalfTurnover` tank
 * turnovers an hour. Nothing settles without a bed, or without water.
 */
export function settlingRate(tank: DecomposingTank, config: DecompositionConfig = decompositionDefaults): number {
  const { water, flow } = tank.resources;
  if (tank.equipment.substrate.type === 'none' || water <= 0) return 0;
  return config.settlingRate / (1 + flow / water / config.settlingHalfTurnover);
}

/** The shares of a pool the hour takes along each path — the aerobic rot, the anaerobic rot and settling — drawing on it together, each first order. */
export interface PoolShares {
  aerobic: number;
  anaerobic: number;
  settling: number;
}

export function poolShares(
  pool: OrganicResourceKey,
  tank: DecomposingTank,
  config: DecompositionConfig = decompositionDefaults
): PoolShares {
  const { aerobic, anaerobic } = rotRates(pool, tank.resources, config);
  const settling = pool === 'mulm' ? 0 : settlingRate(tank, config);
  const [oxic, anoxic, settled] = hourlyDraws([aerobic, anaerobic, settling]);
  return { aerobic: oxic, anaerobic: anoxic, settling: settled };
}

/** What a pool loses over the hour: what rots and what settles into the bed, and the mg of oxygen and CO2 the rot trades. */
export interface PoolHour {
  rotted: Organics;
  settled: Organics;
  oxygen: number;
  co2: number;
}

/** A pool's hour at these shares, pro-rata on everything it holds. */
export function decompose(organics: Organics, shares: PoolShares): PoolHour {
  const rot = shares.aerobic + shares.anaerobic;
  const carbon = organics.carbon * 1000;
  return {
    rotted: scaleOrganics(organics, rot),
    settled: scaleOrganics(organics, shares.settling),
    oxygen: carbon * shares.aerobic * C_TO_O2_MASS_RATIO,
    co2: carbon * rot * C_TO_CO2_MASS_RATIO,
  };
}

/** A pool as the tank holds it: food and waste in the water, mulm in the bed. */
export function organicPool(tank: DecomposingTank, pool: OrganicResourceKey): Organics {
  return pool === 'mulm' ? tank.equipment.substrate.organicReserve : tank.resources[pool];
}

function poolEffects(pool: OrganicResourceKey, hour: PoolHour, water: number): Effect[] {
  const effects: Effect[] = [
    {
      tier: 'passive',
      resource: pool,
      delta: scaleOrganics(sumOrganics(hour.rotted, hour.settled), -1),
      source: 'decomposition',
    },
    ...mineralise(hour.rotted, 'passive', 'decomposition'),
    { tier: 'passive', resource: 'co2', delta: getPpm(hour.co2, water), source: 'decomposition' },
    { tier: 'passive', resource: 'oxygen', delta: -getPpm(hour.oxygen, water), source: 'decomposition' },
  ];
  if (hour.settled.grams > 0) effects.push({ tier: 'passive', resource: 'mulm', delta: hour.settled, source: 'settling' });
  return effects;
}

export const decompositionSystem: System = {
  id: 'decomposition',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    return ORGANIC_POOLS.flatMap((pool) => {
      const organics = organicPool(state, pool);
      if (organics.grams <= 0) return [];
      return poolEffects(pool, decompose(organics, poolShares(pool, state, config.decomposition)), state.resources.water);
    });
  },
};

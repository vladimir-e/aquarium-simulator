/**
 * Decomposition. Rot's aerobic path draws the oxygen a carbohydrate's carbon
 * takes, whatever the pool's composition.
 */

import type { Effect, EffectTier } from '../core/effects.js';
import type { Resources, SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { ORGANIC_POOLS, type OrganicResourceKey } from '../resources/types.js';
import { decompositionDefaults, mapPools, type DecompositionConfig } from '../config/decomposition.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
import { hourlyDraws, monodFactor, q10Factor } from '../core/kinetics.js';
import { C_TO_CO2_MASS_RATIO, C_TO_O2_MASS_RATIO, MG_PER_G } from '../core/chemistry.js';
import { scaleOrganics, sumOrganics, type Organics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { getPpm } from '../resources/helpers.js';
import { ammoniaIn, mintAmmonia } from './nitrogen-cycle.js';

type DecomposingTank = Pick<SimulationState, 'resources' | 'equipment'>;

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

/** A pool's shares on water the hour leaves at `oxygen` mg/L. */
export function poolShares(
  pool: OrganicResourceKey,
  tank: DecomposingTank,
  oxygen: number,
  config: DecompositionConfig = decompositionDefaults
): PoolShares {
  const { aerobic, anaerobic } = rotRates(pool, { temperature: tank.resources.temperature, oxygen }, config);
  const settling = pool === 'mulm' ? 0 : settlingRate(tank, config);
  const [oxic, anoxic, settled] = hourlyDraws([aerobic, anaerobic, settling]);
  return { aerobic: oxic, anaerobic: anoxic, settling: settled };
}

export const rotShare = (shares: PoolShares): number => shares.aerobic + shares.anaerobic;

/** What a pool loses over the hour at its shares: what rots and what settles into the bed, and the mg of oxygen and CO2 the rot trades. */
export interface PoolHour {
  shares: PoolShares;
  rotted: Organics;
  settled: Organics;
  oxygen: number;
  co2: number;
}

const rotOxygen = (organics: Organics, shares: PoolShares): number =>
  organics.carbon * MG_PER_G * shares.aerobic * C_TO_O2_MASS_RATIO;

/** A pool's hour at these shares, pro-rata on everything it holds. */
export function decompose(organics: Organics, shares: PoolShares): PoolHour {
  const rot = rotShare(shares);
  return {
    shares,
    rotted: scaleOrganics(organics, rot),
    settled: scaleOrganics(organics, shares.settling),
    oxygen: rotOxygen(organics, shares),
    co2: organics.carbon * MG_PER_G * rot * C_TO_CO2_MASS_RATIO,
  };
}

/** A pool as the tank holds it: food and waste in the water, mulm in the bed. */
export function organicPool(tank: DecomposingTank, pool: OrganicResourceKey): Organics {
  return pool === 'mulm' ? tank.equipment.substrate.organicReserve : tank.resources[pool];
}

/** Every pool's hour on water the hour leaves at `oxygen` mg/L. */
export function decomposePools(
  tank: DecomposingTank,
  oxygen: number,
  config: DecompositionConfig = decompositionDefaults
): Record<OrganicResourceKey, PoolHour> {
  return mapPools((pool) => decompose(organicPool(tank, pool), poolShares(pool, tank, oxygen, config)));
}

function mineralise(organics: Organics, tier: EffectTier, source: string): Effect[] {
  return [
    ...mintAmmonia(ammoniaIn(organics), tier, source),
    ...WASTE_NUTRIENTS.map((nutrient): Effect => ({ tier, resource: nutrient, delta: organics.nutrients[nutrient], source })),
  ];
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

export const decompositionSystem = {
  id: 'decomposition',
  tier: 'passive',

  oxygenDraw(state: SimulationState, oxygen: number, config: TunableConfig): number {
    return sum(
      ORGANIC_POOLS.map((pool) =>
        rotOxygen(organicPool(state, pool), poolShares(pool, state, oxygen, config.decomposition))
      )
    );
  },

  update(state: SimulationState, config: TunableConfig, oxygen: number): Effect[] {
    const hours = decomposePools(state, oxygen, config.decomposition);
    return ORGANIC_POOLS.flatMap((pool) =>
      organicPool(state, pool).grams > 0 ? poolEffects(pool, hours[pool], state.resources.water) : []
    );
  },
} satisfies System;

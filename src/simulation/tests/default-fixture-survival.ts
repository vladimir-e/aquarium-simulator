/**
 * Every plant species under the shipped default fixture, with every other
 * channel pinned.
 *
 * A plant answers to six inputs at once, so a tank that kills one says nothing
 * about its lighting on its own. Nutrients, CO₂, pH and temperature are
 * rewritten to optimum before every tick, which leaves the fixture as the only
 * thing still free to hurt the planting. One species per run, so nothing is
 * competing for the light either. Run it:
 *
 *     npm run probe:default-fixture-survival
 */

import { produce } from 'immer';
import { calculateTankHeight, type SimulationConfig, type SimulationState } from '../state.js';
import { calculateParAtDepth, DEFAULT_LIGHT, getLightOutput } from '../equipment/light.js';
import { opticsDefaults } from '../config/optics.js';
import { nutrientsDefaults as nutrients } from '../config/nutrients.js';
import { getMassFromPpm } from '../resources/helpers.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../plants/species.js';
import { formatTable } from './sweep.js';
import { runTank } from './metrics.js';

const CAPACITY = 40;
const DAYS = 60;
const PLANTED_AT = 35;
const RNG_SEED = 5;

/** The tank a player gets by pressing nothing: no fixture named, so the default one. */
const SETUP: SimulationConfig = {
  tankCapacity: CAPACITY,
  heater: { enabled: false },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  hardscape: { items: [] },
  lid: { type: 'full' },
  ato: { enabled: true },
  co2Generator: { enabled: true, bubbleRate: 1.0, schedule: { startHour: 7, duration: 10 } },
  powerhead: { enabled: false },
};

/** Everything the light channel is not, held where a plant would want it. */
function atOptimum(state: SimulationState): SimulationState {
  return produce(state, (draft) => {
    const { water } = draft.resources;
    draft.resources.nitrate = getMassFromPpm(nutrients.optimalNitratePpm, water);
    draft.resources.phosphate = getMassFromPpm(nutrients.optimalPhosphatePpm, water);
    draft.resources.potassium = getMassFromPpm(nutrients.optimalPotassiumPpm, water);
    draft.resources.iron = getMassFromPpm(nutrients.optimalIronPpm, water);
    draft.resources.co2 = 20;
    draft.resources.ph = 7.0;
    draft.resources.temperature = 25;
  });
}

const SPECIES: PlantSpecies[] = [
  'anubias',
  'java_fern',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
];

const substratePar = calculateParAtDepth(
  getLightOutput(DEFAULT_LIGHT, DEFAULT_LIGHT.schedule.startHour),
  calculateTankHeight(CAPACITY),
  opticsDefaults
);

const rows = SPECIES.map((species) => {
  const run = runTank({
    setup: SETUP,
    seed: { bacteria: 'cycled', plants: [{ species, count: 1, size: PLANTED_AT }] },
    days: DAYS,
    routine: { hold: atOptimum },
    rngSeed: RNG_SEED,
  });

  const [low, high] = PLANT_SPECIES_DATA[species].tolerableLight;
  const survivor = run.final.plants[0];

  return {
    species,
    band: `${low}-${high}`,
    size: survivor?.size ?? 0,
    condition: survivor?.condition ?? 0,
    died: run.plantDeaths.map((death) => `d${death.day.toFixed(0)}`).join(' '),
    algae: run.final.algae.mass,
  };
});

process.stdout.write(
  `\n— ${CAPACITY} L, ${DEFAULT_LIGHT.par} PAR fixture (${substratePar.toFixed(1)} at the` +
    ` substrate), one plant at size ${PLANTED_AT}, ${DAYS} d —\n${formatTable(rows)}\n`
);

import type { Fish } from '../state.js';
import { livestockDefaults } from '../config/livestock.js';
import { eggsLaid } from '../systems/fish-growth.js';

/** A fish record as a test names it: a grown, fasting neon male on an empty bank, a female's ovary holding the eggs her bank buys, unless it says otherwise. */
export function fishRecord(fields: Partial<Fish> = {}): Fish {
  const made: Fish = {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    gut: 0,
    sex: 'male',
    hardinessOffset: 0,
    surplus: 0,
    ovary: 0,
    ...fields,
  };
  return { ...made, ovary: fields.ovary ?? (made.sex === 'female' ? eggsLaid(made, livestockDefaults) : 0) };
}

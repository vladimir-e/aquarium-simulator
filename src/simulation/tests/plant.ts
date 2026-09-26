import type { Plant } from '../state.js';

/** A plant record as a test names it: a founder of its own family, at no vigour, unless it says otherwise. */
export function plantRecord(
  fields: Pick<Plant, 'id' | 'species' | 'size' | 'condition' | 'surplus'> & Partial<Plant>
): Plant {
  return { parentId: null, familyId: fields.id, age: 0, vigour: 0, ...fields };
}

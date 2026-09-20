/**
 * `config set` against a `TunableConfig`, which is numbers all the way to its
 * leaves. A value that is not a finite number, a path that does not already
 * name one, and a number outside the range the leaf declares are all refused
 * rather than stored: a stored string coerces back to `NaN` in the first
 * multiplication that reads it, a stored key nothing reads is a setting the
 * operator only believes they made, and a coefficient outside its own range
 * is one the engine was never solved for — a negative attenuation turns
 * Beer–Lambert into gain and every lit tick after it infinite.
 */

import {
  configRange,
  tunableAt,
  withTunable,
  type TunableConfig,
} from '../simulation/config/index.js';

export function applyConfigSet(config: TunableConfig, path: string, raw: string): TunableConfig {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new Error(`config set requires a finite number, got "${raw}".`);
  }

  if (tunableAt(config, path) === undefined) {
    throw new Error(`Unknown config path "${path}".`);
  }

  const range = configRange(path);
  if (range && (value < range.min || value > range.max)) {
    throw new Error(`${path} takes ${range.min} to ${range.max}, got ${value}.`);
  }

  return withTunable(config, path, value);
}

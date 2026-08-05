import { describe, it, expect } from 'vitest';
import { assertKnownFlags, main } from '../sim.js';

describe('unknown flags', () => {
  it('refuses to build a tank from a flag it does not have', () => {
    expect(() => main(['new', '--capacity=200'])).toThrow(/Unknown flag --capacity for "new"/);
    expect(() => main(['new', '--capacity=200'])).toThrow(/--tank-liters/);
  });

  it('names every flag it took at once', () => {
    expect(() => main(['new', '--capacity=200', '--seeded'])).toThrow(
      /Unknown flags --capacity, --seeded/
    );
  });

  it('says so before the command it belongs to runs', () => {
    expect(() => main(['observe', '--fields=ph'])).toThrow(/Unknown flag --fields.*It takes none/);
  });

  it('leaves a command it has never heard of to the dispatcher', () => {
    expect(() => main(['nwe', '--preset=planted'])).toThrow(/Unknown command "nwe"/);
    expect(() => assertKnownFlags('add bogus', { species: 'neon_tetra' })).not.toThrow();
  });

  it('takes the flags each command documents', () => {
    expect(() =>
      assertKnownFlags('new', {
        preset: 'planted',
        'tank-gal': '10',
        'tank-liters': '40',
        name: 'run',
        'no-seed': 'true',
      })
    ).not.toThrow();
    expect(() => assertKnownFlags('add fish', { species: 'guppy', count: '3' })).not.toThrow();
    expect(() => assertKnownFlags('add plant', { species: 'anubias', size: '80' })).not.toThrow();
    expect(() => assertKnownFlags('trace', { fields: 'ph', last: '5d', every: '1d' })).not.toThrow();
  });

  it('holds each add target to its own flags', () => {
    expect(() => assertKnownFlags('add fish', { species: 'guppy', size: '80' })).toThrow(
      /Unknown flag --size for "add fish"/
    );
    expect(() => assertKnownFlags('add plant', { species: 'anubias', count: '3' })).toThrow(
      /Unknown flag --count for "add plant"/
    );
  });
});

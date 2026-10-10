import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { invokedDirectly } from '../entry.js';

describe('invokedDirectly', () => {
  const script = '/Users/someone/my projects/aquarium simulator/src/cli/amp/command.ts';
  const moduleUrl = pathToFileURL(script).href;

  it('knows the module node was asked to run from a path with spaces, which its URL escapes', () => {
    expect(moduleUrl).toContain('%20');
    expect(invokedDirectly(moduleUrl, script)).toBe(true);
  });

  it('refuses a module imported by another script, and one run with no script at all', () => {
    expect(invokedDirectly(moduleUrl, '/Users/someone/my projects/aquarium simulator/src/cli/sim.ts')).toBe(false);
    expect(invokedDirectly(moduleUrl, undefined)).toBe(false);
  });
});

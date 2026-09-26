import { describe, it, expect } from 'vitest';
import { ceiled, floored } from './latch.js';

describe('ceiled and floored', () => {
  it('round a figure between steps toward their own side', () => {
    expect(ceiled(40.04, 1)).toBe('40.1');
    expect(ceiled(0.5004, 3)).toBe('0.501');
    expect(floored(3.96, 1)).toBe('3.9');
    expect(floored(49.99, 1)).toBe('49.9');
  });

  it('leave a figure already on a step as written', () => {
    expect(ceiled(1.1, 1)).toBe('1.1');
    expect(floored(0.7, 1)).toBe('0.7');
    expect(ceiled(15, 1)).toBe('15.0');
    expect(floored(15, 1)).toBe('15.0');
  });
});

import { describe, it, expect } from 'vitest';
import { createLog } from './logging.js';

describe('createLog', () => {
  it('builds an entry from its four parts', () => {
    expect(createLog(5, 'user', 'warning', 'Test message')).toEqual({
      tick: 5,
      source: 'user',
      severity: 'warning',
      message: 'Test message',
    });
  });
});

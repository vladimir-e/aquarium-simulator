/**
 * Tests for resource type definitions and utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  getResourceValue,
  clampResourceValue,
  type ResourceDefinition,
} from './types.js';

describe('Resource utilities', () => {
  // Mock resource definition for testing
  const mockResource: ResourceDefinition = {
    key: 'test',
    location: 'resources',
    property: 'temperature',
    unit: '°C',
    bounds: { min: 0, max: 50 },
    defaultValue: 25,
    precision: 1,
    format: (value: number) => `${value.toFixed(1)}°C`,
  };

  describe('getResourceValue', () => {
    it('should read value from resources location', () => {
      const state = {
        resources: { temperature: 26.5 },
        tank: {},
      };

      const value = getResourceValue(state, mockResource);
      expect(value).toBe(26.5);
    });

    it('should read value from tank location', () => {
      const tankResource: ResourceDefinition = {
        ...mockResource,
        location: 'tank',
        property: 'waterLevel',
      };

      const state = {
        resources: {},
        tank: { waterLevel: 40 },
      };

      const value = getResourceValue(state, tankResource);
      expect(value).toBe(40);
    });

    it('should return default value if property missing', () => {
      const state = {
        resources: {},
        tank: {},
      };

      const value = getResourceValue(state, mockResource);
      expect(value).toBe(25);
    });
  });

  describe('clampResourceValue', () => {
    it('should clamp value below minimum', () => {
      const clamped = clampResourceValue(-5, mockResource);
      expect(clamped).toBe(0);
    });

    it('should clamp value above maximum', () => {
      const clamped = clampResourceValue(60, mockResource);
      expect(clamped).toBe(50);
    });

    it('should not clamp value within bounds', () => {
      const clamped = clampResourceValue(25, mockResource);
      expect(clamped).toBe(25);
    });

    it('should handle edge cases at boundaries', () => {
      expect(clampResourceValue(0, mockResource)).toBe(0);
      expect(clampResourceValue(50, mockResource)).toBe(50);
    });
  });
});

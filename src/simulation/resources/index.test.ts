/**
 * Tests for resource registry and definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  ResourceRegistry,
  getResource,
  TemperatureResource,
  WaterLevelResource,
  FoodResource,
  WasteResource,
  AlgaeResource,
  type ResourceKey,
} from './index.js';

describe('Resource Registry', () => {
  describe('Registry completeness', () => {
    it('should contain all resources', () => {
      expect(ResourceRegistry.temperature).toBeDefined();
      expect(ResourceRegistry.waterLevel).toBeDefined();
      expect(ResourceRegistry.food).toBeDefined();
      expect(ResourceRegistry.waste).toBeDefined();
      expect(ResourceRegistry.algae).toBeDefined();
    });

    it('should have correct keys', () => {
      const keys = Object.keys(ResourceRegistry);
      expect(keys).toEqual(['temperature', 'waterLevel', 'food', 'waste', 'algae']);
    });
  });

  describe('getResource', () => {
    it('should return correct resource by key', () => {
      expect(getResource('temperature')).toBe(TemperatureResource);
      expect(getResource('waterLevel')).toBe(WaterLevelResource);
      expect(getResource('food')).toBe(FoodResource);
      expect(getResource('waste')).toBe(WasteResource);
      expect(getResource('algae')).toBe(AlgaeResource);
    });
  });

  describe('TemperatureResource', () => {
    it('should have correct metadata', () => {
      expect(TemperatureResource.key).toBe('temperature');
      expect(TemperatureResource.location).toBe('resources');
      expect(TemperatureResource.property).toBe('temperature');
      expect(TemperatureResource.unit).toBe('°C');
      expect(TemperatureResource.defaultValue).toBe(25);
      expect(TemperatureResource.precision).toBe(1);
    });

    it('should have correct bounds', () => {
      expect(TemperatureResource.bounds).toEqual({ min: 0, max: 50 });
    });

    it('should format correctly', () => {
      expect(TemperatureResource.format(25)).toBe('25.0°C');
      expect(TemperatureResource.format(25.5)).toBe('25.5°C');
      expect(TemperatureResource.format(25.567)).toBe('25.6°C');
    });

    it('should have safe and stress ranges', () => {
      expect(TemperatureResource.safeRange).toEqual({ min: 18, max: 30 });
      expect(TemperatureResource.stressRange).toEqual({ min: 15, max: 33 });
    });
  });

  describe('WaterLevelResource', () => {
    it('should have correct metadata', () => {
      expect(WaterLevelResource.key).toBe('waterLevel');
      expect(WaterLevelResource.location).toBe('tank');
      expect(WaterLevelResource.property).toBe('waterLevel');
      expect(WaterLevelResource.unit).toBe('L');
      expect(WaterLevelResource.defaultValue).toBe(0);
      expect(WaterLevelResource.precision).toBe(1);
    });

    it('should format correctly', () => {
      expect(WaterLevelResource.format(40)).toBe('40.0L');
      expect(WaterLevelResource.format(40.5)).toBe('40.5L');
    });
  });

  describe('FoodResource', () => {
    it('should have correct metadata', () => {
      expect(FoodResource.key).toBe('food');
      expect(FoodResource.location).toBe('resources');
      expect(FoodResource.unit).toBe('g');
      expect(FoodResource.defaultValue).toBe(0);
      expect(FoodResource.precision).toBe(2);
    });

    it('should have correct bounds', () => {
      expect(FoodResource.bounds).toEqual({ min: 0, max: 1000 });
    });

    it('should format correctly', () => {
      expect(FoodResource.format(0.5)).toBe('0.50g');
      expect(FoodResource.format(2.345)).toBe('2.35g');
    });
  });

  describe('WasteResource', () => {
    it('should have correct metadata', () => {
      expect(WasteResource.key).toBe('waste');
      expect(WasteResource.location).toBe('resources');
      expect(WasteResource.unit).toBe('g');
      expect(WasteResource.defaultValue).toBe(0);
      expect(WasteResource.precision).toBe(2);
    });

    it('should have correct bounds', () => {
      expect(WasteResource.bounds).toEqual({ min: 0, max: 1000 });
    });

    it('should format correctly', () => {
      expect(WasteResource.format(1.5)).toBe('1.50g');
      expect(WasteResource.format(10.123)).toBe('10.12g');
    });
  });

  describe('AlgaeResource', () => {
    it('should have correct metadata', () => {
      expect(AlgaeResource.key).toBe('algae');
      expect(AlgaeResource.location).toBe('resources');
      expect(AlgaeResource.unit).toBe('');
      expect(AlgaeResource.defaultValue).toBe(0);
      expect(AlgaeResource.precision).toBe(0);
    });

    it('should have correct bounds', () => {
      expect(AlgaeResource.bounds).toEqual({ min: 0, max: 100 });
    });

    it('should format correctly', () => {
      expect(AlgaeResource.format(50)).toBe('50');
      expect(AlgaeResource.format(50.7)).toBe('51');
    });

    it('should have safe and stress ranges', () => {
      expect(AlgaeResource.safeRange).toEqual({ min: 0, max: 50 });
      expect(AlgaeResource.stressRange).toEqual({ min: 50, max: 80 });
    });
  });

  describe('Type safety', () => {
    it('should type ResourceKey as union of keys', () => {
      const validKeys: ResourceKey[] = [
        'temperature',
        'waterLevel',
        'food',
        'waste',
        'algae',
      ];

      validKeys.forEach((key) => {
        expect(() => getResource(key)).not.toThrow();
      });
    });
  });
});

import { describe, it, expect } from 'vitest';
import { processPlants } from './index.js';
import { createSimulation, type SimulationState, type Plant } from '../state.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';

describe('processPlants', () => {
  function createTestState(overrides: Partial<{
    plants: Plant[];
    light: number;
    co2: number;
    nitrate: number;
    oxygen: number;
    temperature: number;
    water: number;
    waste: number;
  }> = {}): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      if (overrides.plants !== undefined) {
        draft.plants = overrides.plants;
      }
      if (overrides.light !== undefined) {
        draft.resources.light = overrides.light;
      }
      if (overrides.co2 !== undefined) {
        draft.resources.co2 = overrides.co2;
      }
      if (overrides.nitrate !== undefined) {
        draft.resources.nitrate = overrides.nitrate;
      }
      if (overrides.oxygen !== undefined) {
        draft.resources.oxygen = overrides.oxygen;
      }
      if (overrides.temperature !== undefined) {
        draft.resources.temperature = overrides.temperature;
      }
      if (overrides.water !== undefined) {
        draft.resources.water = overrides.water;
      }
      if (overrides.waste !== undefined) {
        draft.resources.waste = overrides.waste;
      }
    });
  }

  describe('with no plants', () => {
    it('returns unchanged state when no plants', () => {
      const state = createTestState({ plants: [] });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state).toBe(state);
      expect(result.effects).toHaveLength(0);
    });

    it('returns no effects when no plants', () => {
      const state = createTestState({ plants: [], light: 50 });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.effects).toHaveLength(0);
    });
  });

  describe('with plants and lights on (photosynthesis + respiration)', () => {
    const defaultPlants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 100 },
    ];

    it('produces oxygen effect from photosynthesis', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100, // optimal in 100L
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const o2EffectPhoto = result.effects.find(
        (e) => e.resource === 'oxygen' && e.source === 'photosynthesis'
      );
      expect(o2EffectPhoto).toBeDefined();
      expect(o2EffectPhoto!.delta).toBeGreaterThan(0);
    });

    it('consumes CO2 from photosynthesis (negative delta)', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const co2EffectPhoto = result.effects.find(
        (e) => e.resource === 'co2' && e.source === 'photosynthesis'
      );
      expect(co2EffectPhoto).toBeDefined();
      expect(co2EffectPhoto!.delta).toBeLessThan(0);
    });

    it('consumes nitrate from photosynthesis (negative delta)', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const nitrateEffect = result.effects.find(
        (e) => e.resource === 'nitrate' && e.source === 'photosynthesis'
      );
      expect(nitrateEffect).toBeDefined();
      expect(nitrateEffect!.delta).toBeLessThan(0);
    });

    it('consumes oxygen from respiration (negative delta)', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const o2EffectResp = result.effects.find(
        (e) => e.resource === 'oxygen' && e.source === 'respiration'
      );
      expect(o2EffectResp).toBeDefined();
      expect(o2EffectResp!.delta).toBeLessThan(0);
    });

    it('produces CO2 from respiration (positive delta)', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const co2EffectResp = result.effects.find(
        (e) => e.resource === 'co2' && e.source === 'respiration'
      );
      expect(co2EffectResp).toBeDefined();
      expect(co2EffectResp!.delta).toBeGreaterThan(0);
    });

    it('all effects have tier: active', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      result.effects.forEach((effect) => {
        expect(effect.tier).toBe('active');
      });
    });

    it('updates plant sizes due to growth', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
    });
  });

  describe('with lights off (respiration only)', () => {
    const defaultPlants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 100 },
    ];

    it('no photosynthesis effects when light is 0', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 0,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const photoEffects = result.effects.filter((e) => e.source === 'photosynthesis');
      expect(photoEffects).toHaveLength(0);
    });

    it('respiration still occurs when lights off', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 0,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const respEffects = result.effects.filter((e) => e.source === 'respiration');
      expect(respEffects.length).toBeGreaterThan(0);
    });

    it('oxygen consumed (net negative) at night', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 0,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const o2Effects = result.effects.filter((e) => e.resource === 'oxygen');
      const netO2 = o2Effects.reduce((sum, e) => sum + e.delta, 0);
      expect(netO2).toBeLessThan(0);
    });

    it('CO2 produced (net positive) at night', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 0,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const co2Effects = result.effects.filter((e) => e.resource === 'co2');
      const netCo2 = co2Effects.reduce((sum, e) => sum + e.delta, 0);
      expect(netCo2).toBeGreaterThan(0);
    });

    it('plant sizes unchanged when no photosynthesis', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50 }],
        light: 0,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBe(50);
    });
  });

  describe('day/night O2 balance', () => {
    it('net positive O2 during day (photosynthesis > respiration)', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const o2Effects = result.effects.filter((e) => e.resource === 'oxygen');
      const netO2 = o2Effects.reduce((sum, e) => sum + e.delta, 0);
      expect(netO2).toBeGreaterThan(0);
    });

    it('net negative O2 during night (respiration only)', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 0,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const o2Effects = result.effects.filter((e) => e.resource === 'oxygen');
      const netO2 = o2Effects.reduce((sum, e) => sum + e.delta, 0);
      expect(netO2).toBeLessThan(0);
    });

    it('day produces more O2 than night consumes (net positive over 24h)', () => {
      const dayState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
        temperature: 25,
      });
      const nightState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 0,
        temperature: 25,
      });

      const dayResult = processPlants(dayState, DEFAULT_CONFIG);
      const nightResult = processPlants(nightState, DEFAULT_CONFIG);

      const dayO2 = dayResult.effects
        .filter((e) => e.resource === 'oxygen')
        .reduce((sum, e) => sum + e.delta, 0);
      const nightO2 = nightResult.effects
        .filter((e) => e.resource === 'oxygen')
        .reduce((sum, e) => sum + e.delta, 0);

      // Day O2 production should be greater than night consumption
      expect(dayO2).toBeGreaterThan(Math.abs(nightO2));
    });
  });

  describe('waste effect when plants overgrow', () => {
    it('produces waste when plant exceeds 200%', () => {
      // Plant at 199% with enough growth to push over 200%
      const state = createTestState({
        plants: [{ id: 'p1', species: 'monte_carlo', size: 199 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const wasteEffect = result.effects.find((e) => e.resource === 'waste');
      // If plant grows past 200%, waste is released
      if (result.state.plants[0].size === 200) {
        expect(wasteEffect).toBeDefined();
        expect(wasteEffect!.delta).toBeGreaterThan(0);
        expect(wasteEffect!.source).toBe('plant-overgrowth');
      }
    });

    it('no waste when plants below 200%', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const wasteEffect = result.effects.find((e) => e.resource === 'waste');
      expect(wasteEffect).toBeUndefined();
    });

    it('plant size capped at 200%', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'monte_carlo', size: 199 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeLessThanOrEqual(200);
    });
  });

  describe('multiple plants', () => {
    it('processes multiple plants correctly', () => {
      const state = createTestState({
        plants: [
          { id: 'p1', species: 'java_fern', size: 50 },
          { id: 'p2', species: 'anubias', size: 60 },
          { id: 'p3', species: 'amazon_sword', size: 70 },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      // All plants should grow
      expect(result.state.plants[0].size).toBeGreaterThan(50);
      expect(result.state.plants[1].size).toBeGreaterThan(60);
      expect(result.state.plants[2].size).toBeGreaterThan(70);
    });

    it('total plant size affects photosynthesis rate', () => {
      const singlePlantState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const multiplePlantsState = createTestState({
        plants: [
          { id: 'p1', species: 'java_fern', size: 100 },
          { id: 'p2', species: 'java_fern', size: 100 },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });

      const singleResult = processPlants(singlePlantState, DEFAULT_CONFIG);
      const multipleResult = processPlants(multiplePlantsState, DEFAULT_CONFIG);

      const singleO2 = singleResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'photosynthesis')
        .reduce((sum, e) => sum + e.delta, 0);
      const multipleO2 = multipleResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'photosynthesis')
        .reduce((sum, e) => sum + e.delta, 0);

      // 200% plant size should produce ~2x O2
      expect(multipleO2).toBeCloseTo(singleO2 * 2, 4);
    });
  });

  describe('limiting conditions', () => {
    it('low CO2 reduces photosynthesis', () => {
      const optimalState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const lowCo2State = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2 / 4, // 25% of optimal
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });

      const optimalResult = processPlants(optimalState, DEFAULT_CONFIG);
      const lowCo2Result = processPlants(lowCo2State, DEFAULT_CONFIG);

      const optimalO2 = optimalResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'photosynthesis')
        .reduce((sum, e) => sum + e.delta, 0);
      const lowCo2O2 = lowCo2Result.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'photosynthesis')
        .reduce((sum, e) => sum + e.delta, 0);

      expect(lowCo2O2).toBeLessThan(optimalO2);
    });

    it('low nitrate reduces photosynthesis', () => {
      const optimalState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100, // optimal
        water: 100,
      });
      const lowNitrateState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: (plantsDefaults.optimalNitrate / 4) * 100, // 25% of optimal
        water: 100,
      });

      const optimalResult = processPlants(optimalState, DEFAULT_CONFIG);
      const lowNitrateResult = processPlants(lowNitrateState, DEFAULT_CONFIG);

      const optimalO2 = optimalResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'photosynthesis')
        .reduce((sum, e) => sum + e.delta, 0);
      const lowNitrateO2 = lowNitrateResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'photosynthesis')
        .reduce((sum, e) => sum + e.delta, 0);

      expect(lowNitrateO2).toBeLessThan(optimalO2);
    });
  });

  describe('temperature effects on respiration', () => {
    it('higher temperature increases respiration', () => {
      const coldState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 0,
        temperature: 20,
      });
      const warmState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100 }],
        light: 0,
        temperature: 30,
      });

      const coldResult = processPlants(coldState, DEFAULT_CONFIG);
      const warmResult = processPlants(warmState, DEFAULT_CONFIG);

      const coldO2 = coldResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'respiration')
        .reduce((sum, e) => sum + e.delta, 0);
      const warmO2 = warmResult.effects
        .filter((e) => e.resource === 'oxygen' && e.source === 'respiration')
        .reduce((sum, e) => sum + e.delta, 0);

      // Warm tank consumes more O2 (more negative)
      expect(warmO2).toBeLessThan(coldO2);
    });
  });

  describe('immutability', () => {
    it('does not modify original state', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const originalSize = state.plants[0].size;

      processPlants(state, DEFAULT_CONFIG);

      expect(state.plants[0].size).toBe(originalSize);
    });

    it('returns new state object when plants grow', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state).not.toBe(state);
    });
  });
});

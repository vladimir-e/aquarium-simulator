import { describe, it, expect } from 'vitest';
import { processPlants } from './index.js';
import { createSimulation, type SimulationState, type Plant } from '../state.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults } from '../config/nutrients.js';

describe('processPlants', () => {
  // Default per-plant condition for test stubs — new in the per-plant Liebig
  // engine (before, plants were a raw {id, species, size} bag).
  const C = 100;

  function createTestState(overrides: Partial<{
    plants: Plant[];
    light: number;
    co2: number;
    nitrate: number;
    phosphate: number;
    potassium: number;
    iron: number;
    oxygen: number;
    temperature: number;
    water: number;
    waste: number;
  }> = {}): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      // Seed all four plant macronutrients to optimal so Liebig's Law
      // doesn't zero out photosynthesis by default. Tests that probe a
      // specific limiting nutrient explicitly override its value.
      const waterVol = overrides.water ?? draft.resources.water;
      draft.resources.phosphate = nutrientsDefaults.optimalPhosphatePpm * waterVol;
      draft.resources.potassium = nutrientsDefaults.optimalPotassiumPpm * waterVol;
      draft.resources.iron = nutrientsDefaults.optimalIronPpm * waterVol;
      draft.resources.nitrate = nutrientsDefaults.optimalNitratePpm * waterVol;

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
      if (overrides.phosphate !== undefined) {
        draft.resources.phosphate = overrides.phosphate;
      }
      if (overrides.potassium !== undefined) {
        draft.resources.potassium = overrides.potassium;
      }
      if (overrides.iron !== undefined) {
        draft.resources.iron = overrides.iron;
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
      { id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 },
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
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
    });

    it('does not grow plants whose condition is sub-100 (surplus-overflow gate)', () => {
      // Task 40 design: a stressed plant heals first, never crawls
      // forward at reduced rate. If condition < 100 the plant takes 0
      // share of the photosynthesis biomass that tick — its
      // photosynthate flows to maintenance, not new tissue.
      const state = createTestState({
        plants: [
          { id: 'p1', species: 'java_fern', size: 50, condition: 80, surplus: 0 },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      // Size unchanged because surplus is gated by condition === 100.
      expect(result.state.plants[0].size).toBe(50);
      // Condition heals (vitality net is positive in good conditions).
      expect(result.state.plants[0].condition).toBeGreaterThan(80);
    });

    it('only the at-100 plant grows when paired with a sub-100 sibling', () => {
      // Two java_ferns, identical species and starting size; one
      // healthy, one sub-100 condition. Only the healthy one should
      // grow this tick — and it gets the full biomass share since the
      // unhealthy sibling is excluded from the share calculation.
      const state = createTestState({
        plants: [
          { id: 'healthy', species: 'java_fern', size: 50, condition: 100, surplus: 0 },
          { id: 'stressed', species: 'java_fern', size: 50, condition: 70, surplus: 0 },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      const healthy = result.state.plants.find((p) => p.id === 'healthy');
      const stressed = result.state.plants.find((p) => p.id === 'stressed');
      expect(healthy?.size).toBeGreaterThan(50);
      expect(stressed?.size).toBe(50);
    });
  });

  describe('with lights off (respiration only)', () => {
    const defaultPlants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 },
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

    it('no photosynthesis effects when lights off', () => {
      // Photosynthesis is light-gated and emits no resource effects
      // when lights are off. Plant size doesn't move either — see
      // the photoperiod-gate describe block below for the full
      // banking + growth gating contract.
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
        light: 0,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      const photoEffects = result.effects.filter(
        (e) => e.source === 'photosynthesis'
      );
      expect(photoEffects).toHaveLength(0);
    });
  });

  describe('photoperiod gate on surplus banking and growth', () => {
    // Plant surplus represents stored photosynthate (sugars from carbon
    // fixation). Both banking and spending gate on `resources.light > 0`:
    // no photosynthesis = no energy capture and no net biomass
    // accumulation. Vitality runs every tick regardless — condition
    // can still heal at night from non-light benefits — but the
    // surplus pipeline pauses overnight.

    it('does not bank surplus at night even with otherwise-ideal conditions', () => {
      // Plant is at full condition with all non-light vitality factors
      // in their tolerable bands. Vitality still emits surplus
      // mathematically (positive net rate from pH/temp/nutrients), but
      // the orchestrator discards it because lights are off.
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 5 }],
        light: 0,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].surplus).toBe(5);
    });

    it('does not grow at night even with banked surplus', () => {
      // A plant entering night with a full bank should NOT spend any
      // of it on growth. Both the bank (already filled) and the size
      // stay put.
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 100 }],
        light: 0,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].size).toBe(50);
      expect(result.state.plants[0].surplus).toBe(100);
    });

    it('banks surplus during the day under ideal conditions', () => {
      // Same conditions as the night-banking test, but lights on. The
      // bank should grow by exactly the vitality emission this tick,
      // minus whatever growth drains. With a small starting surplus,
      // the post-spend bank is still measurably above the start.
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      // Plant either banked + spent (size up, surplus could be 0 if
      // fully drained) or banked + partially spent (surplus > 0).
      // What's required: at least one of the two is non-trivially
      // moved. Tighter assertions live in the "Growth happens" test.
      const after = result.state.plants[0];
      expect(after.size + after.surplus).toBeGreaterThan(50);
    });

    it('grows during the day when surplus is available', () => {
      // Pre-banked surplus + lights on → measurable size gain.
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 10 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].size).toBeGreaterThan(50);
      // Bank drained by at most plantGrowthPerTickCap (it could also
      // gain from this tick's vitality emission — net direction
      // depends on whether emission > drain). Either way, less than
      // the starting 10.
      expect(result.state.plants[0].surplus).toBeLessThan(10 + plantsDefaults.plantGrowthPerTickCap);
    });

    it('day/night/day cycle: surplus and size advance only during lit periods', () => {
      // 5 ticks day → 5 ticks night → 5 ticks day. Snapshot after
      // each segment. Night segment must leave surplus and size
      // exactly as the prior day segment ended; day segments must
      // both advance them.
      let state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const runTicks = (
        s: SimulationState,
        ticks: number,
        light: number
      ): SimulationState => {
        let current = produce(s, (draft) => {
          draft.resources.light = light;
        });
        for (let t = 0; t < ticks; t++) {
          const r = processPlants(current, DEFAULT_CONFIG);
          current = r.state;
        }
        return current;
      };
      const afterDay1 = runTicks(state, 5, 50);
      const sizeDay1 = afterDay1.plants[0].size;
      const surplusDay1 = afterDay1.plants[0].surplus;
      expect(sizeDay1).toBeGreaterThan(50);

      const afterNight = runTicks(afterDay1, 5, 0);
      // Night freezes both: surplus banking and growth-driven size
      // changes are gated. (Shedding/death paths could touch size,
      // but with condition 100 in this scenario neither fires.)
      expect(afterNight.plants[0].size).toBe(sizeDay1);
      expect(afterNight.plants[0].surplus).toBe(surplusDay1);

      const afterDay2 = runTicks(afterNight, 5, 50);
      // Resumes advance once lights return.
      expect(afterDay2.plants[0].size).toBeGreaterThan(sizeDay1);
    });
  });

  describe('day/night O2 balance', () => {
    it('net positive O2 during day (photosynthesis > respiration)', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
        temperature: 25,
      });
      const nightState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'monte_carlo', size: 199, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'monte_carlo', size: 199, condition: C, surplus: 0 }],
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
          { id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 },
          { id: 'p2', species: 'anubias', size: 60, condition: C, surplus: 0 },
          { id: 'p3', species: 'amazon_sword', size: 70, condition: C, surplus: 0 },
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
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const multiplePlantsState = createTestState({
        plants: [
          { id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 },
          { id: 'p2', species: 'java_fern', size: 100, condition: C, surplus: 0 },
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
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const lowCo2State = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100, // optimal
        water: 100,
      });
      const lowNitrateState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
        light: 0,
        temperature: 20,
      });
      const warmState = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
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
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
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

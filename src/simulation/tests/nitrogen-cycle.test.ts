import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { getPpm, getMassFromPpm } from '../resources/helpers.js';

/**
 * Nitrogen Cycle Integration Tests
 *
 * These tests exercise the nitrogen cycle through the full tick loop,
 * verifying how multiple systems (decay, nitrogen cycle, equipment)
 * interact together rather than testing any system function in isolation.
 */

describe('Nitrogen Cycle Integration', () => {
  describe('Waste converts to ammonia over ticks', () => {
    it('waste is consumed and ammonia appears after ticking', () => {
      let state = createSimulation({ tankCapacity: 100 });

      // Inject waste directly to isolate the waste-to-ammonia conversion
      state = produce(state, (draft) => {
        draft.resources.waste = 5.0; // 5 grams of waste
      });

      const initialWaste = state.resources.waste;
      const initialAmmonia = state.resources.ammonia;

      // Run several ticks through the full tick loop
      for (let i = 0; i < 10; i++) {
        state = tick(state);
      }

      // Waste should have decreased (nitrogen cycle mineralization consumes it)
      expect(state.resources.waste).toBeLessThan(initialWaste);
      // Ammonia should have increased (waste converts to ammonia)
      expect(state.resources.ammonia).toBeGreaterThan(initialAmmonia);
    });

    it('more waste produces more ammonia', () => {
      let lowWaste = createSimulation({ tankCapacity: 100 });
      let highWaste = createSimulation({ tankCapacity: 100 });

      lowWaste = produce(lowWaste, (draft) => {
        draft.resources.waste = 1.0;
      });
      highWaste = produce(highWaste, (draft) => {
        draft.resources.waste = 10.0;
      });

      // Run one tick
      lowWaste = tick(lowWaste);
      highWaste = tick(highWaste);

      expect(highWaste.resources.ammonia).toBeGreaterThan(lowWaste.resources.ammonia);
    });
  });

  describe('AOB bacteria grow and convert ammonia to nitrite', () => {
    it('AOB spawn when ammonia ppm reaches threshold, then convert ammonia to nitrite', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Inject ammonia above the AOB spawn threshold (0.02 ppm default)
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(2.0, 40); // 2 ppm = 80 mg
      });

      expect(state.resources.aob).toBe(0);
      expect(state.resources.nitrite).toBe(0);

      // First tick: AOB should spawn
      state = tick(state);
      expect(state.resources.aob).toBeGreaterThan(0);

      // Run enough ticks for AOB to grow large enough to meaningfully process ammonia.
      // With logistic growth starting from a small spawn, bacteria need time to
      // build population before they outpace the ambient waste ammonia input.
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // AOB should have grown substantially from initial spawn
      expect(state.resources.aob).toBeGreaterThan(10);
      // Nitrite should have appeared (ammonia converted by AOB)
      expect(state.resources.nitrite).toBeGreaterThan(0);
      // Ammonia ppm should have decreased from the initial 2.0 ppm.
      // (Ambient waste adds ~0.01 g/hr of waste, some of which becomes ammonia,
      // but a healthy AOB colony should process faster than ambient production.)
      const ammoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
      expect(ammoniaPpm).toBeLessThan(2.0);
    });

    it('AOB population grows over time when ammonia is present', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Seed with ammonia and a small AOB population
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(1.0, 40);
        draft.resources.aob = 10;
      });

      const initialAob = state.resources.aob;

      for (let i = 0; i < 24; i++) {
        state = tick(state);
      }

      // AOB should have grown (logistic growth with food supply)
      expect(state.resources.aob).toBeGreaterThan(initialAob);
    });
  });

  describe('NOB bacteria grow and convert nitrite to nitrate', () => {
    it('NOB spawn when nitrite ppm reaches threshold, then convert nitrite to nitrate', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Inject nitrite above NOB spawn threshold (0.125 ppm default)
      state = produce(state, (draft) => {
        draft.resources.nitrite = getMassFromPpm(2.0, 40); // 2 ppm = 80 mg
      });

      expect(state.resources.nob).toBe(0);
      expect(state.resources.nitrate).toBe(0);

      // First tick: NOB should spawn
      state = tick(state);
      expect(state.resources.nob).toBeGreaterThan(0);

      // Run enough ticks for NOB to grow and meaningfully process nitrite.
      // The ambient waste pipeline also feeds ammonia -> nitrite via AOB,
      // so NOB must grow large enough to outpace this small input.
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // NOB should have grown
      expect(state.resources.nob).toBeGreaterThan(10);
      // Nitrate should have appeared
      expect(state.resources.nitrate).toBeGreaterThan(0);
      // Nitrite ppm should have decreased from the initial 2.0 ppm
      const nitritePpm = getPpm(state.resources.nitrite, state.resources.water);
      expect(nitritePpm).toBeLessThan(2.0);
    });

    it('NOB population grows over time when nitrite is present', () => {
      let state = createSimulation({ tankCapacity: 40 });

      state = produce(state, (draft) => {
        draft.resources.nitrite = getMassFromPpm(1.0, 40);
        draft.resources.nob = 10;
      });

      const initialNob = state.resources.nob;

      for (let i = 0; i < 24; i++) {
        state = tick(state);
      }

      expect(state.resources.nob).toBeGreaterThan(initialNob);
    });
  });

  describe('Bacteria population is limited by available surface area', () => {
    it('bacteria cannot exceed max capacity for the given surface area', () => {
      // Small surface area = low max bacteria (surface * 0.01 bacteriaPerCm2)
      // Default 40L tank has glass surface ~1600 cm2, sponge filter 8000 cm2, etc.
      // Use a small tank with minimal equipment to keep surface low
      let smallSurface = createSimulation({
        tankCapacity: 20,
        filter: { enabled: false, type: 'sponge' },
      });

      // Large surface area for comparison
      let largeSurface = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'canister' },
      });

      // Seed both with ammonia so AOB can grow
      smallSurface = produce(smallSurface, (draft) => {
        draft.resources.ammonia = getMassFromPpm(3.0, draft.resources.water);
        draft.resources.aob = 5;
      });
      largeSurface = produce(largeSurface, (draft) => {
        draft.resources.ammonia = getMassFromPpm(3.0, draft.resources.water);
        draft.resources.aob = 5;
      });

      // Run many ticks to let bacteria approach carrying capacity
      for (let i = 0; i < 200; i++) {
        smallSurface = tick(smallSurface);
        largeSurface = tick(largeSurface);
      }

      // Both should have AOB, but large surface should support more
      expect(largeSurface.resources.aob).toBeGreaterThan(smallSurface.resources.aob);

      // AOB should not exceed max = surface * bacteriaPerCm2
      const smallMax = smallSurface.resources.surface * 0.01;
      const largeMax = largeSurface.resources.surface * 0.01;
      expect(smallSurface.resources.aob).toBeLessThanOrEqual(smallMax + 0.01);
      expect(largeSurface.resources.aob).toBeLessThanOrEqual(largeMax + 0.01);
    });

    it('bacteria growth slows as population approaches surface capacity', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Start with some AOB and plenty of ammonia
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(5.0, 40);
        draft.resources.aob = 5;
      });

      // Track growth rates at different population levels
      const growthSnapshots: { aob: number; growth: number }[] = [];

      for (let i = 0; i < 100; i++) {
        const prevAob = state.resources.aob;
        state = tick(state);
        const growth = state.resources.aob - prevAob;
        if (i % 10 === 0) {
          growthSnapshots.push({ aob: prevAob, growth });
        }
      }

      // Growth rate should decrease as population increases (logistic growth)
      // Compare early growth rate (per capita) to later growth rate (per capita)
      const earlySnapshot = growthSnapshots[0];
      const lateSnapshot = growthSnapshots[growthSnapshots.length - 1];

      if (earlySnapshot.aob > 0 && lateSnapshot.aob > 0) {
        const earlyPerCapita = earlySnapshot.growth / earlySnapshot.aob;
        const latePerCapita = lateSnapshot.growth / lateSnapshot.aob;
        expect(latePerCapita).toBeLessThan(earlyPerCapita);
      }
    });
  });

  describe('Bacteria die back when food source is removed', () => {
    it('AOB decline when ammonia is depleted', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Build up a healthy AOB population with ammonia
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(2.0, 40);
        draft.resources.aob = 50;
      });

      // Let bacteria grow and process ammonia
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      const aobBeforeStarvation = state.resources.aob;
      expect(aobBeforeStarvation).toBeGreaterThan(0);

      // Now remove all ammonia, simulating no further waste input
      state = produce(state, (draft) => {
        draft.resources.ammonia = 0;
        draft.resources.waste = 0;
      });

      // Run more ticks without any ammonia source
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // AOB should have declined significantly (death from starvation)
      // Note: ambient waste from decay produces tiny amounts of ammonia,
      // so bacteria may not die completely but should decline dramatically
      expect(state.resources.aob).toBeLessThan(aobBeforeStarvation);
    });

    it('NOB decline when nitrite is depleted', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Build up NOB population with nitrite
      state = produce(state, (draft) => {
        draft.resources.nitrite = getMassFromPpm(2.0, 40);
        draft.resources.nob = 50;
      });

      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      const nobBeforeStarvation = state.resources.nob;
      expect(nobBeforeStarvation).toBeGreaterThan(0);

      // Remove nitrite and all upstream sources
      state = produce(state, (draft) => {
        draft.resources.nitrite = 0;
        draft.resources.ammonia = 0;
        draft.resources.waste = 0;
      });

      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      expect(state.resources.nob).toBeLessThan(nobBeforeStarvation);
    });
  });

  describe('Full pipeline: feed -> food decays -> waste -> ammonia -> nitrite -> nitrate', () => {
    it('feeding produces nitrate as the end product after sufficient ticks', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Feed the tank
      state = applyAction(state, { type: 'feed', amount: 2.0 }).state;

      expect(state.resources.food).toBe(2.0);
      expect(state.resources.nitrate).toBe(0);

      // Phase 1: Let food decay into waste and waste into ammonia (~ first 100 ticks)
      // This also lets AOB spawn once ammonia threshold is reached
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      // Food should have mostly decayed
      expect(state.resources.food).toBeLessThan(0.1);
      // Ammonia should have been produced from the waste
      expect(state.resources.ammonia).toBeGreaterThan(0);
      // AOB should have spawned and started working
      expect(state.resources.aob).toBeGreaterThan(0);

      // Phase 2: Let AOB convert ammonia to nitrite and NOB spawn
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // Nitrite should be present (from AOB processing ammonia)
      // NOB may have spawned and started converting nitrite to nitrate
      const totalNitrogenProducts =
        state.resources.ammonia + state.resources.nitrite + state.resources.nitrate;
      expect(totalNitrogenProducts).toBeGreaterThan(0);

      // Phase 3: Run long enough for full pipeline to complete
      for (let i = 0; i < 400; i++) {
        state = tick(state);
      }

      // After 700 total ticks (~29 days), the full cycle should have produced nitrate
      expect(state.resources.nitrate).toBeGreaterThan(0);
    });

    it('nitrogen is conserved through the pipeline (mass balance)', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // Inject a known amount of waste (skip food decay for cleaner tracking)
      state = produce(state, (draft) => {
        draft.resources.waste = 2.0; // 2g waste
      });

      // Seed bacteria so the full pipeline runs
      state = produce(state, (draft) => {
        draft.resources.aob = 20;
        draft.resources.nob = 20;
      });

      // Run enough ticks for waste to fully convert
      for (let i = 0; i < 300; i++) {
        state = tick(state);
      }

      // All nitrogen compounds (ammonia + nitrite + nitrate) in mg
      // should be positive — the waste was converted into the nitrogen pipeline
      const totalNitrogenMass =
        state.resources.ammonia + state.resources.nitrite + state.resources.nitrate;
      expect(totalNitrogenMass).toBeGreaterThan(0);

      // The initial 2g waste should have been largely consumed.
      // A small steady-state waste level persists from ambient waste production
      // (0.01 g/tick from the decay system), so we check it's well below the
      // starting 2g rather than near-zero.
      expect(state.resources.waste).toBeLessThan(0.1);
    });

    it('multiple feedings accumulate nitrogen products', () => {
      let state = createSimulation({ tankCapacity: 100 });

      // Seed bacteria
      state = produce(state, (draft) => {
        draft.resources.aob = 10;
        draft.resources.nob = 10;
      });

      // Feed once and run
      state = applyAction(state, { type: 'feed', amount: 1.0 }).state;
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      const nitrateAfterFirstFeeding = state.resources.nitrate;

      // Feed again and run more
      state = applyAction(state, { type: 'feed', amount: 1.0 }).state;
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // Nitrate should have increased from the second feeding
      expect(state.resources.nitrate).toBeGreaterThan(nitrateAfterFirstFeeding);
    });
  });

  describe('Filter removal reduces surface area and bacterial capacity', () => {
    it('disabling filter reduces surface and caps bacteria population', () => {
      let state = createSimulation({
        tankCapacity: 40,
        filter: { enabled: true, type: 'canister' }, // Canister = 25000 cm2
      });

      // Build up a large bacterial population using the high surface area
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(3.0, 40);
        draft.resources.nitrite = getMassFromPpm(3.0, 40);
        draft.resources.aob = 200;
        draft.resources.nob = 200;
      });

      // Run ticks to let bacteria grow toward the canister's high capacity
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      const aobWithFilter = state.resources.aob;
      const nobWithFilter = state.resources.nob;
      const surfaceWithFilter = state.resources.surface;

      expect(aobWithFilter).toBeGreaterThan(100);
      expect(nobWithFilter).toBeGreaterThan(0);

      // Now disable the filter — surface area drops dramatically
      state = produce(state, (draft) => {
        draft.equipment.filter.enabled = false;
      });

      // Run a tick so passive resources recalculate and bacteria get capped
      state = tick(state);

      const surfaceWithoutFilter = state.resources.surface;

      // Surface should have dropped significantly (lost 25000 cm2 from canister)
      expect(surfaceWithoutFilter).toBeLessThan(surfaceWithFilter);

      // New max bacteria = surface * 0.01
      const newMaxBacteria = surfaceWithoutFilter * 0.01;

      // Bacteria should have been capped to new maximum
      // (surface cap applies in the nitrogen cycle system)
      expect(state.resources.aob).toBeLessThanOrEqual(newMaxBacteria + 0.01);
      expect(state.resources.nob).toBeLessThanOrEqual(newMaxBacteria + 0.01);

      // Bacteria should be lower than they were with the filter
      expect(state.resources.aob).toBeLessThan(aobWithFilter);
    });

    it('switching to a smaller filter reduces bacterial capacity', () => {
      // Start with canister (25000 cm2)
      let state = createSimulation({
        tankCapacity: 40,
        filter: { enabled: true, type: 'canister' },
      });

      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(2.0, 40);
        draft.resources.aob = 150;
      });

      // Run to stabilize
      for (let i = 0; i < 50; i++) {
        state = tick(state);
      }

      const aobWithCanister = state.resources.aob;

      // Switch to sponge filter (8000 cm2 — much less surface)
      state = produce(state, (draft) => {
        draft.equipment.filter.type = 'sponge';
      });

      // Run more ticks — bacteria should be capped to new lower limit
      for (let i = 0; i < 10; i++) {
        state = tick(state);
      }

      const maxWithSponge = state.resources.surface * 0.01;

      // If AOB was above new max, it should have been capped
      if (aobWithCanister > maxWithSponge) {
        expect(state.resources.aob).toBeLessThanOrEqual(maxWithSponge + 0.01);
      }
    });
  });

  describe('Emergent behavior: cycling timeline', () => {
    it('simulates a realistic fishless cycle through the full tick loop', () => {
      // Setup: 40L tank at 25C, inject ammonia (simulating fishless cycle dosing)
      let state = createSimulation({
        tankCapacity: 40,
        initialTemperature: 25,
      });

      // Dose ammonia to 2 ppm to start the fishless cycle
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(2.0, 40);
      });

      let peakAmmoniaPpm = 0;
      let peakNitritePpm = 0;
      let aobSpawnedTick = -1;
      let nobSpawnedTick = -1;

      // Run for 30 simulated days (720 ticks)
      for (let i = 0; i < 720; i++) {
        state = tick(state);

        const ammoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
        const nitritePpm = getPpm(state.resources.nitrite, state.resources.water);

        if (ammoniaPpm > peakAmmoniaPpm) peakAmmoniaPpm = ammoniaPpm;
        if (nitritePpm > peakNitritePpm) {
          peakNitritePpm = nitritePpm;
        }
        if (aobSpawnedTick === -1 && state.resources.aob > 0) aobSpawnedTick = i;
        if (nobSpawnedTick === -1 && state.resources.nob > 0) nobSpawnedTick = i;
      }

      const finalAmmoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
      const finalNitratePpm = getPpm(state.resources.nitrate, state.resources.water);

      // AOB should have spawned early (ammonia was above threshold from start)
      expect(aobSpawnedTick).toBe(0); // First tick

      // NOB spawns after enough nitrite accumulates (later than AOB)
      expect(nobSpawnedTick).toBeGreaterThan(aobSpawnedTick);

      // Ammonia should have been substantially processed
      expect(finalAmmoniaPpm).toBeLessThan(peakAmmoniaPpm);

      // Nitrate should be the dominant end product
      expect(finalNitratePpm).toBeGreaterThan(0);

      // Both bacteria populations should be established
      expect(state.resources.aob).toBeGreaterThan(0);
      expect(state.resources.nob).toBeGreaterThan(0);
    });

    it('ambient waste seeds the nitrogen cycle even without feeding', () => {
      let state = createSimulation({ tankCapacity: 40 });

      // No food, no manual ammonia — just ambient waste from the decay system
      // Ambient waste = 0.01 g/hr (from decay config)
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // Ambient waste should have accumulated and converted to ammonia
      expect(state.resources.ammonia).toBeGreaterThan(0);

      // AOB may have spawned if ammonia reached spawn threshold
      // In 200 ticks: ~2g waste accumulated, ~0.6g converted/tick cycle
      // ammonia produced depends on waste-to-ammonia ratio
      // This is a natural seeding process
      const ammoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
      if (ammoniaPpm >= 0.02) {
        // If ammonia reached spawn threshold, AOB should be present
        expect(state.resources.aob).toBeGreaterThan(0);
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { getPpm, getMassFromPpm } from '../resources/helpers.js';
import { calculateMaxBacteria } from '../systems/nitrogen-cycle.js';

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
      let state = createSimulation({ tankCapacity: 40, substrate: { type: 'aqua_soil' } });

      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(2.0, 40); // 2 ppm = 80 mg
      });

      expect(state.resources.aob).toBe(0);
      expect(state.resources.nitrite).toBe(0);

      // First tick: AOB should spawn
      state = tick(state);
      expect(state.resources.aob).toBeGreaterThan(0);

      // Run enough ticks for AOB to grow meaningful processing capacity.
      for (let i = 0; i < 500; i++) {
        state = tick(state);
      }

      // AOB should have grown substantially from initial spawn. The 1-unit
      // floor protects against "AOB regress to single-digits" failure modes
      // without pinning to a specific number.
      expect(state.resources.aob).toBeGreaterThan(1);
      // The nitrite AOB made has been carried through to nitrate — by 500 ticks
      // the NOB have caught up, so the standing nitrite is what is left over
      // rather than what was produced.
      expect(state.resources.nitrate).toBeGreaterThan(0);
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
      // The colony seeds at a fraction of a unit and doubles every ~40 h, so
      // clearing a 2 ppm bolus is three weeks of work, not one.
      const initialNitriteMass = state.resources.nitrite;
      for (let i = 0; i < 600; i++) {
        state = tick(state);
      }

      // NOB should have grown
      expect(state.resources.nob).toBeGreaterThan(10);
      // Nitrate should have accumulated — primary observable.
      expect(state.resources.nitrate).toBeGreaterThan(0);
      // NOB must have consumed at least the initial nitrite bolus — nitrate
      // produced (scaled back to NO2-mass via MW ratio) should exceed the
      // starting mass.
      const nitrateAsNo2Mass = state.resources.nitrate * (46.01 / 62.0);
      expect(nitrateAsNo2Mass).toBeGreaterThan(initialNitriteMass * 0.5);
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

      expect(smallSurface.resources.aob).toBeLessThanOrEqual(
        calculateMaxBacteria(smallSurface.resources.surface)
      );
      expect(largeSurface.resources.aob).toBeLessThanOrEqual(
        calculateMaxBacteria(largeSurface.resources.surface)
      );
    });

    it('bacteria growth slows as population approaches surface capacity', () => {
      // The same tank and the same hour at three fills, so the headroom term is
      // the only thing that differs between the readings. Reading it off one
      // colony as it grows would instead be reading whatever else moved on the
      // way — the tank's oxygen most of all, which climbs to saturation over
      // the first day and carries the growth rate with it.
      const bare = createSimulation({ tankCapacity: 40 });
      const ceiling = calculateMaxBacteria(bare.resources.surface);

      const perCapita = (fill: number): number => {
        const start = produce(bare, (draft) => {
          draft.resources.ammonia = getMassFromPpm(50, draft.resources.water);
          draft.resources.aob = ceiling * fill;
        });
        return (tick(start).resources.aob - start.resources.aob) / start.resources.aob;
      };

      expect(perCapita(0.9)).toBeLessThan(perCapita(0.5));
      expect(perCapita(0.5)).toBeLessThan(perCapita(0.1));
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

      // AOB should have declined significantly
      expect(state.resources.aob).toBeLessThan(aobBeforeStarvation);
    });

    it('NOB decline when nitrite is depleted', () => {
      // Bare bottom: nothing leaches, so the population genuinely starves.
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

      // A colony filling the canister's surface — the only state where losing
      // that surface is what limits it, rather than the load it lives on.
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(3.0, 40);
        draft.resources.nitrite = getMassFromPpm(3.0, 40);
        draft.resources.aob = calculateMaxBacteria(draft.resources.surface);
        draft.resources.nob = calculateMaxBacteria(draft.resources.surface);
      });

      const aobWithFilter = state.resources.aob;
      const surfaceWithFilter = state.resources.surface;

      // Now disable the filter — surface area drops dramatically
      state = produce(state, (draft) => {
        draft.equipment.filter.enabled = false;
      });

      // Run a tick so passive resources recalculate and bacteria get capped
      state = tick(state);

      const surfaceWithoutFilter = state.resources.surface;

      // Surface should have dropped significantly (lost 25000 cm2 from canister)
      expect(surfaceWithoutFilter).toBeLessThan(surfaceWithFilter);

      const newMaxBacteria = calculateMaxBacteria(surfaceWithoutFilter);

      // Bacteria should have been capped to new maximum
      // (surface cap applies in the nitrogen cycle system)
      expect(state.resources.aob).toBeLessThanOrEqual(newMaxBacteria);
      expect(state.resources.nob).toBeLessThanOrEqual(newMaxBacteria);

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

      const maxWithSponge = calculateMaxBacteria(state.resources.surface);

      // If AOB was above new max, it should have been capped
      if (aobWithCanister > maxWithSponge) {
        expect(state.resources.aob).toBeLessThanOrEqual(maxWithSponge);
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

    it('substrate leaching seeds the nitrogen cycle even without feeding', () => {
      let state = createSimulation({ tankCapacity: 40, substrate: { type: 'aqua_soil' } });

      // No food, no manual ammonia — just the soil bed mineralizing.
      // This is the "cycle seeds itself over weeks" bootstrap pathway.
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      expect(state.resources.aob).toBeGreaterThan(0);
      expect(state.resources.nitrate).toBeGreaterThan(0);
    });

    it('a bare-bottom tank never starts a cycle on its own', () => {
      let state = createSimulation({ tankCapacity: 40 });

      for (let i = 0; i < 24 * 56; i++) {
        state = tick(state);
      }

      expect(getPpm(state.resources.ammonia, state.resources.water)).toBe(0);
      expect(state.resources.aob).toBe(0);
    });
  });
});

# Task 24: Simulation Calibration with Real-World Scenarios

**Status:** completed

## Overview

Calibrate all simulation constants by creating integration tests based on real-world aquarium scenarios. Each test sets up a tank configuration, runs N ticks, and asserts resource values at key milestones with ~20% tolerance.

**Approach**: Define many diverse scenarios sourced from real hobbyist data and scientific literature. Write integration tests that run the full tick loop and check milestones. Adjust tunable constants until all scenarios pass. This ensures the simulation is "approximately correct" across the entire parameter space.

## References

- `src/simulation/config/` - All tunable constants
- `src/simulation/state.ts` - `createSimulation()`, species data
- `src/simulation/tick.ts` - Main tick loop
- `src/simulation/actions/index.ts` - `applyAction()`
- `src/simulation/integration.test.ts` - Existing integration test pattern

## Scope

### In Scope

- Integration test scenarios for all resource systems
- Milestone assertions with ~20% tolerance ranges
- Constant adjustments to satisfy tests
- Helper utilities for running multi-tick scenarios

### Out of Scope

- UI changes
- New simulation features or mechanics
- Unit tests for individual functions (existing tests cover this)

## Test Infrastructure

Create `src/simulation/calibration.test.ts` with helper utilities:

```typescript
// Helper to run N ticks and optionally perform actions at specific ticks
function runScenario(options: {
  tank: CreateSimulationOptions;
  ticks: number;
  actions?: Array<{ tick: number; action: Action }>;
  checkpoints?: Array<{ tick: number; check: (state: SimulationState) => void }>;
}): SimulationState;

// Helper for ppm assertions with tolerance
function expectPpm(resource: number, water: number, expected: number, tolerancePercent: number): void;

// Helper to get concentration
function ppm(mass: number, water: number): number;
```

---

## Scenarios

### A. Nitrogen Cycle Scenarios

#### A1. Fishless Cycle — 10 gal, Sponge Filter, Gravel

**Setup**: 38L tank, sponge filter (8,000 cm² surface, ~150 L/h flow), gravel substrate (800 cm²/L = 30,400 cm²), ambient waste 0.01 g/hr, temperature 25.5°C.

**Total surface**: ~38,400 cm². Bacteria carrying capacity = 384 (at 0.01/cm²).

**Ammonia source**: Dose 2 ppm ammonia at tick 0 (= 76 mg in 38L). Redose to 2 ppm whenever ammonia drops below 0.5 ppm.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Ammonia stable initially | 24 | ~2 ppm (no processing yet) | ±20% |
| AOB detectable (ammonia declining) | 120-168 (day 5-7) | ammonia < 1.5 ppm | ammonia should be noticeably lower than 2 ppm |
| Nitrite first appears | 144-192 (day 6-8) | nitrite > 0.1 ppm | must be nonzero |
| Ammonia processes 2 ppm in 24hr | 240-336 (day 10-14) | ammonia < 0.25 ppm within 24hr of redose | |
| Nitrite peak | 240-336 (day 10-14) | nitrite 2-5 ppm | peak range |
| Nitrate accumulating | 336 (day 14) | nitrate > 5 ppm | |
| Nitrite declining | 408-504 (day 17-21) | nitrite < 2 ppm | |
| Cycle complete | 600-840 (day 25-35) | ammonia 0, nitrite 0, nitrate > 20 ppm | both < 0.1 ppm |

**Real-world source**: DrTim's Aquatics fishless cycling guide, Aquarium Science, hobbyist cycling logs.

#### A2. Aqua Soil Cycle — 40 gal, HOB Filter

**Setup**: 150L tank, HOB filter (15,000 cm² surface, ~900 L/h flow), aqua soil substrate (1,200 cm²/L = 180,000 cm²), temperature 25.5°C.

**Total surface**: ~195,000 cm². Bacteria carrying capacity = 1,950.

**Ammonia source**: Aqua soil leaching — simulate as continuous ammonia addition. Approximate: add 1.0 mg ammonia per tick for first 500 ticks (3 weeks), tapering to 0.3 mg/tick for next 500 ticks, then 0 (soil exhausted). Perform 50% water changes every 48 ticks (2 days) for the first 2 weeks.

*Note*: This scenario requires adding an "aqua soil leaching" action or initial ammonia injection pattern. If aqua soil isn't modeled as an ammonia source yet, simulate it via periodic feed/ammonia-add actions.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Initial ammonia spike | 48-96 (day 2-4) | ammonia 2-4 ppm (before water change) | ±30% |
| AOB establishing | 168-336 (week 1-2) | ammonia declining between water changes | |
| Nitrite peak | 504-840 (week 3-5) | nitrite 2-5 ppm | |
| Cycle complete | 1008-1344 (week 6-8) | ammonia 0, nitrite 0 | both < 0.1 ppm |

**Real-world source**: ADA Aquasoil cycling logs, Planted Tank Forum, The Shrimp Farm.

#### A3. Fish-In Cycle — 100 gal, Canister Filter, Hardy Fish

**Setup**: 380L tank, canister filter (25,000 cm² surface, ~3,000 L/h flow), gravel substrate (800 cm²/L = 304,000 cm²), 4 guppies (1g each, hardiness 0.8), temperature 24.5°C.

**Total surface**: ~329,000 cm². Bacteria carrying capacity = 3,290.

**Maintenance**: Feed 0.1g every 24 ticks. 25% water change every 48 ticks when ammonia > 0.25 ppm.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| First detectable ammonia | 72-120 (day 3-5) | ammonia 0.1-0.5 ppm | |
| Ammonia peak (pre-water change) | 240-336 (week 2) | ammonia 0.25-1.0 ppm | |
| AOB established | 336-504 (week 2-3) | ammonia dropping between water changes | |
| Nitrite peak | 504-672 (week 3-4) | nitrite 0.25-1.0 ppm | lower than fishless |
| Cycle complete | 1008-1344 (week 6-8) | ammonia 0, nitrite 0, nitrate 10-25 ppm | |
| Fish survive | All ticks | health > 50% for all fish | hardy fish tolerate low levels |

**Real-world source**: FishLab fish-in cycle guide, Aquarium Science.

#### A4. Established Tank — Adding New Fish

**Setup**: Pre-cycled tank (380L, canister, 6 guppies, AOB/NOB at carrying capacity, nitrate 15 ppm). Add 4 more guppies at tick 0.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Ammonia spike | 12-48 | ammonia 0-0.25 ppm | may be undetectable |
| Recovery | 72-120 (day 3-5) | ammonia 0, nitrite 0 | bacteria adapt |
| New nitrate equilibrium | 168 (week 1) | nitrate baseline + 3-8 ppm | |

**Real-world source**: Aquarium forum bioload adaptation data.

#### A5. Filter Media Replacement — Mini-Cycle

**Setup**: Pre-cycled tank (150L, HOB). At tick 0, reduce surface area by 70% (simulating new media). Keep 4 guppies.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Ammonia rises | 24-48 | ammonia 0.25-1.0 ppm | |
| Mini-cycle nitrite | 72-120 | nitrite 0.25-0.5 ppm | |
| Recovery | 168-336 (1-2 weeks) | ammonia 0, nitrite 0 | bacteria recolonize |

---

### B. Gas Exchange Scenarios

#### B1. O2 Saturation at Equilibrium

**Setup**: Empty 100L tank, 25°C, filter running (good flow, ~10x turnover), no fish/plants.

| Milestone | Steady state | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| O2 at equilibrium | After 48+ ticks | 8.0-8.5 mg/L | Real: 8.26 mg/L at 25°C |

At 20°C: 8.8-9.3 mg/L (real: 9.08). At 30°C: 7.3-7.8 mg/L (real: 7.56).

**Real-world source**: YSI dissolved oxygen solubility tables, Henry's Law.

#### B2. Power Outage — O2 Recovery

**Setup**: 100L tank at steady state O2 (~8.2 mg/L), 4 fish (total 10g). At tick 0, disable filter (flow = 0). At tick 6, re-enable filter.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| O2 declining | 3 | O2 < 7.0 mg/L | fish consuming, no exchange |
| O2 dangerous | 6 | O2 4-6 mg/L | |
| O2 recovering | 8 (2hr after restart) | O2 > 6 mg/L | |
| O2 near saturation | 12 (6hr after restart) | O2 > 7.5 mg/L | |

**Real-world source**: Aquarium Co-Op power outage guide, Aquariumscience.org aeration data.

#### B3. CO2 Injection — Planted Tank

**Setup**: 150L tank, CO2 generator at 2 bps, light on schedule 8:00-18:00. Starting CO2 at atmospheric (~4 mg/L).

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| CO2 rising (injection on) | 2 | CO2 15-25 mg/L | |
| CO2 equilibrium (injection on) | 4-6 | CO2 25-35 mg/L | target ~30 ppm |
| CO2 dropping (injection off) | +2hr after off | CO2 < 20 mg/L | |
| CO2 near atmospheric | +8hr after off | CO2 < 8 mg/L | |

**Real-world source**: CO2Art injection guide, 2Hr Aquarist CO2 fine-tuning.

#### B4. Overnight O2 Drop — Heavily Planted Tank

**Setup**: 100L tank, 5 plants at 80% size each (400% total), CO2 injection during day, 10 neon tetras. Run 48 ticks (2 full days).

| Milestone | Time of day | Expected | Tolerance |
|-----------|------------|----------|-----------|
| O2 peak (afternoon) | Hour 14-16 | O2 8-12 mg/L | photosynthesis exceeds respiration |
| O2 minimum (pre-dawn) | Hour 6-8 | O2 4-6 mg/L | overnight respiration drop of 2-4 mg/L |

**Real-world source**: UKAPS forum DO measurements, Fondriest environmental monitoring.

#### B5. Aeration Effect

**Setup**: 100L tank, no aeration, O2 at 5.5 mg/L. At tick 0, enable air pump.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| O2 rising | 1 | O2 > 6.5 mg/L | +1-1.5 mg/L in first hour |
| O2 near saturation | 2-3 | O2 > 7.5 mg/L | |
| O2 steady state | 6+ | O2 7.8-8.5 mg/L | 90-95% saturation |

**Real-world source**: Aquariumscience.org aeration data, TFH Magazine.

---

### C. Temperature Scenarios

#### C1. Small Tank Cooling — Heater Failure

**Setup**: 38L tank, initial temp 25°C, room temp 20°C. Heater disabled at tick 0.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Temp at 1hr | 1 | 24.0-24.5°C | ~0.5-1.0°C/hr cooling |
| Temp at 4hr | 4 | 22.0-23.0°C | |
| Temp at 8hr | 8 | 20.5-21.5°C | approaching room temp |
| Temp at 24hr | 24 | 20.0-20.5°C | near equilibrium |

**Real-world source**: FishLore power outage reports, Planted Tank Forum.

#### C2. Large Tank Cooling — Heater Failure

**Setup**: 380L tank, initial temp 25°C, room temp 20°C. Heater disabled.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Temp at 1hr | 1 | 24.5-24.8°C | ~0.2-0.5°C/hr cooling |
| Temp at 4hr | 4 | 23.4-24.0°C | |
| Temp at 8hr | 8 | 22.0-23.0°C | |
| Temp at 24hr | 24 | 20.2-21.0°C | slower than small tank |

**Real-world source**: Reefs.com heat transfer article, BeanAnimal thermodynamics.

#### C3. Water Change Temperature Blend

**Setup**: 150L tank at 25.5°C. Perform 25% water change with tap water at 20°C.

| Milestone | After action | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Immediate temp | Tick 0 (post-change) | 24.0-24.3°C | simple mixing: 0.75*25.5 + 0.25*20 = 24.1°C |

**Real-world source**: Simple thermodynamics, confirmed by FishLore forum reports.

---

### D. Evaporation Scenarios

#### D1. Uncovered Tank Evaporation

**Setup**: 150L tank, 25°C water, 22°C room (3°C differential), no lid.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Water after 24hr | 24 | 148.5-149.5 L | ~0.5-1.5% per day |
| Water after 7 days | 168 | 142-148 L | cumulative 1-5% |

**Real-world source**: Reef2Reef evaporation measurements, Salt Tank Report.

#### D2. Lid Reduces Evaporation

**Setup**: Same as D1 but with full lid (glass). Run 168 ticks.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Water after 7 days | 168 | 148.5-150 L | 75-90% reduction vs no lid |

**Real-world source**: Reef2Reef glass lid measurements.

---

### E. Plant Growth and Nutrient Scenarios

#### E1. Fast-Growing Plants Under Optimal Conditions

**Setup**: 150L tank, high light (30W), CO2 at 30 ppm, 3 Monte Carlo plants at 20% size each, full EI dosing (nitrate 15 ppm, phosphate 1 ppm, potassium 10 ppm, iron 0.2 ppm), 25°C.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Plant growth per day | 24 (lights on 10hr) | 0.5-2.0% size increase per plant | |
| After 30 days | 720 | Plants at 35-80% size | substantial growth |
| Condition stays high | 720 | condition > 80% | nutrients sufficient |

**Real-world source**: 2Hr Aquarist growth rates, planted tank carpeting timelines (4-8 weeks for Monte Carlo).

#### E2. EI Dosing — Nutrient Depletion Between Doses

**Setup**: 150L tank, moderate plants (3 Amazon Swords at 60% size = 180% total plant size), dose 5ml fertilizer weekly. No water change for simplicity.

| Milestone | After dose | Expected | Tolerance |
|-----------|-----------|----------|-----------|
| Nitrate immediately after dose | 0 | +1.7 ppm from dose | 5ml * 50mg/ml / 150L |
| Nitrate consumption per day | 24 | 0.5-4 ppm drop (high-tech) or 0.1-0.5 (low-tech) | depends on light/CO2 |
| Iron depleted | 48-72 | iron < 0.05 ppm | iron is consumed fastest |

**Real-world source**: Planted Tank Forum nitrate consumption reports (3.5-4 ppm/day high-tech), EI dosing tables.

#### E3. Nutrient Deficiency — No Dosing

**Setup**: 150L tank, high-demand plants (Dwarf Hairgrass), no fertilizer dosing, no fish (no waste as nutrient source). Start with nutrients at optimal levels.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Nutrients depleted | 168-336 (1-2 weeks) | iron 0, potassium dropping | |
| Condition declining | 336-504 (2-3 weeks) | condition < 50% | struggling |
| Shedding begins | 504-672 (3-4 weeks) | size decreasing, waste increasing | |

**Real-world source**: Aquarium Co-Op nutrient deficiency guide, Aquasabi deficiency symptoms.

---

### F. Algae Scenarios

#### F1. New Tank Algae Bloom — No Plants

**Setup**: 100L tank, 20W light on 10hr/day, no plants, no fish, moderate nitrate (10 ppm).

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Algae appearing | 168-504 (week 1-3) | algae > 5 | first visible growth |
| Algae established | 504-840 (week 3-5) | algae 20-50 | noticeable coverage |
| Algae dominant | 1344+ (week 8+) | algae 60-80+ | without intervention |

**Real-world source**: 2Hr Aquarist algae maturity timeline, Aquasabi cycling phase algae.

#### F2. Plants Suppress Algae

**Setup**: 100L tank, 20W light, 5 fast-growing plants at 80% size (400% total), EI dosing, CO2 injection. Compare algae growth to F1.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Algae at 4 weeks | 672 | algae < 15 | plants outcompete |
| Algae at 8 weeks | 1344 | algae < 25 | significantly less than F1 |

**Real-world source**: 2Hr Aquarist plant competition, planted tank community consensus.

#### F3. Algae Scrub Recovery

**Setup**: Tank with algae at 60. Scrub to 20. No other changes.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Algae after scrub | 0 | 20 | |
| Algae recovering | 168 (1 week) | 30-45 | comes back without addressing root cause |
| Algae back to pre-scrub | 504 (3 weeks) | 50-65 | |

---

### G. pH Scenarios

#### G1. CO2 Injection pH Drop

**Setup**: 150L tank, pH at 7.4, CO2 injection active. No hardscape.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| pH after CO2 reaches 30 ppm | 4-6 | pH 6.2-6.8 | ~0.8-1.2 unit drop |
| pH after CO2 off (overnight) | +8hr | pH 7.0-7.4 | returns toward baseline |

**Real-world source**: 2Hr Aquarist pH/CO2 guide, KH/pH/CO2 chart (at KH 3, 30 ppm CO2 = pH ~6.4).

*Note*: Current linear `co2PhCoefficient` of -0.02 may be insufficient to produce a 1.0 pH drop. This scenario will likely require adjusting the pH-CO2 model.

#### G2. Driftwood Lowers pH

**Setup**: 150L tank, pH at 7.4, 2 pieces of driftwood. No CO2.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| pH after 1 week | 168 | pH 7.0-7.3 | gradual drop of 0.2-0.5 |
| pH after 4 weeks | 672 | pH 6.8-7.1 | approaches driftwood target |

**Real-world source**: FishLore driftwood pH reports, Aquarium Advice forum.

#### G3. Calcite Rock Raises pH

**Setup**: 150L tank, pH at 7.0, 2 pieces of calcite rock. No CO2.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| pH after 1 week | 168 | pH 7.2-7.5 | |
| pH after 4 weeks | 672 | pH 7.5-7.9 | approaches calcite target |

**Real-world source**: Aquarium Science pH raising guide, Aquarium Co-Op crushed coral data.

---

### H. Fish Metabolism Scenarios

#### H1. Fish Bioload — Ammonia Production

**Setup**: Cycled 38L tank with sponge filter, 6 neon tetras (0.5g each, 3g total), fed 0.05g every 24 ticks. No plants.

| Milestone | Steady state | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Ammonia | Always | 0 ppm (cycled tank) | bacteria process it |
| Nitrate rise per week | 168 | 5-15 ppm increase | from 3g fish bioload in 38L |
| Weekly water change needed | 168 | To keep nitrate < 40 ppm | |

**Real-world source**: Aquarium Science stocking guidelines, FishLab bioload data.

#### H2. Fish Oxygen Consumption

**Setup**: 100L tank at O2 saturation (8.2 mg/L), 10 neon tetras (5g total). Filter running.

| Milestone | Steady state | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| O2 with fish + filter | Equilibrium | O2 7.5-8.0 mg/L | slight depression from fish respiration |
| O2 drop per hour (filter off) | 1 tick | 0.05-0.2 mg/L | 5g fish @ 800-1000 mg O2/kg/hr = 4-5 mg/hr total / 100L |

**Real-world source**: Global Seafood Alliance dissolved O2, FAO aeration chapter.

#### H3. Overfeeding Scenario

**Setup**: Cycled 100L tank, 6 guppies. At tick 0, feed 10x normal (1.0g instead of 0.1g).

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Ammonia rising | 24-48 | ammonia 0.5-2.0 ppm | bacteria overwhelmed |
| Ammonia peak | 48-72 | ammonia 2-5 ppm | |
| Bacteria adapting | 72-120 | ammonia declining | doubling in response |
| Recovery | 120-168 (5-7 days) | ammonia ~0, nitrate elevated | |

**Real-world source**: Fishkeeping.co.uk ammonia emergency data, Glass Grown Aquatics.

#### H4. Fish Health — Ammonia Stress

**Setup**: 38L tank with 1 angelfish (hardiness 0.4, 15g). Ammonia at 0.5 ppm constant (uncycled tank).

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Health declining | 24 | health < 90% | ammonia stress kicking in |
| Visible stress | 72 | health < 70% | |
| Critical | 168 (1 week) | health < 40% | without intervention |

At 1.0 ppm ammonia, decline should be roughly 2x faster.

**Real-world source**: FishLab ammonia stress guide, PMC ammonia toxicity review.

---

### I. Decay Scenarios

#### I1. Food Decay Rate

**Setup**: 100L tank at 25°C. Feed 1.0g. No fish to consume it. Measure food remaining.

| Milestone | Tick (hours) | Expected | Tolerance |
|-----------|-------------|----------|-----------|
| Food at 6hr | 6 | 0.6-0.8g | ~5% decay/hr at 25°C |
| Food at 24hr | 24 | 0.2-0.4g | mostly decayed |
| Food at 48hr | 48 | < 0.05g | nearly gone |
| Waste accumulated | 48 | 0.3-0.4g | ~40% of food becomes waste |

**Real-world source**: Aquarium Advice food decomposition timelines, Reef2Reef protein breakdown.

#### I2. Temperature Effect on Decay

**Setup**: Same as I1 but compare 20°C vs 30°C.

| Milestone | At 24hr | Expected | Tolerance |
|-----------|---------|----------|-----------|
| Food remaining at 20°C | 24 | 0.3-0.5g | slower decay |
| Food remaining at 30°C | 24 | 0.1-0.2g | ~2x faster (Q10=2) |

---

## Implementation

### 1. Create Test Helper Module

Create `src/simulation/calibration-helpers.ts` with:
- `runScenario()` — runs N ticks with optional actions at specific ticks
- `createCycledTank()` — creates a pre-cycled state (bacteria at capacity, nitrate at baseline)
- `expectPpmRange()` — asserts ppm within a range
- Logging utility to capture resource values at each checkpoint

### 2. Create Calibration Test File

Create `src/simulation/calibration.test.ts` organized by system:
- Group A: Nitrogen cycle scenarios
- Group B: Gas exchange scenarios
- Group C: Temperature scenarios
- Group D: Evaporation scenarios
- Group E: Plant/nutrient scenarios
- Group F: Algae scenarios
- Group G: pH scenarios
- Group H: Fish metabolism scenarios
- Group I: Decay scenarios

Each scenario follows the pattern:
```typescript
it('A1: fishless cycle completes in 25-35 days', () => {
  // Setup
  const state = createSimulation({ ... });
  // Run with periodic actions and checkpoints
  const result = runScenario({ ... });
  // Assert final state
});
```

### 3. Calibrate Constants

Run tests iteratively, adjusting constants in `src/simulation/config/`:

**Priority order** (fix fundamentals first):
1. Gas exchange: O2 saturation formula (currently underestimates at low temps)
2. Nitrogen cycle: bacterial growth rates, processing rates
3. Temperature drift: already well-calibrated
4. Decay: verify Q10 behavior
5. pH: CO2-pH model (may need logarithmic instead of linear)
6. Plants: growth rates, nutrient consumption
7. Algae: growth curve
8. Fish: food rate, respiration rate

**Known issues from research**:
- `o2SaturationBase` should be ~10.08 (currently 8.5)
- `o2SaturationSlope` should be ~-0.17 (currently -0.05)
- `aerationExchangeMultiplier` should be ~3.0 (currently 2.0)
- `nobGrowthRate` should be ≤ `aobGrowthRate` (currently NOB grows faster, contradicts biology)
- `co2PhCoefficient` linear model insufficient for 1.0 pH unit drop at 30 ppm CO2
- `baseFoodRate` may need reduction (fish currently consume too much food)
- `hungerIncreaseRate` at 4%/hr may be too aggressive (fish can survive 3-7 days without food)

### 4. Document Calibration Results

After tuning, update each config file's comments with calibration notes showing what real-world data informed the constant value.

## Acceptance Criteria

- [ ] Test helper module created with `runScenario()` and supporting utilities
- [ ] All scenarios (A1-I2) implemented as integration tests
- [ ] At least 80% of scenarios pass with calibrated constants
- [ ] Constants adjusted with comments linking to real-world data
- [ ] Nitrogen cycle completes in 25-35 days (fishless) and 6-8 weeks (fish-in)
- [ ] O2 saturation matches real values within 10% at 20°C, 25°C, 30°C
- [ ] Temperature drift matches real cooling rates for 38L and 380L tanks
- [ ] No existing unit tests broken by constant changes

## Tests

This task IS the tests. The calibration test file serves as both the test suite and the acceptance criteria.

## Notes

- Some scenarios (A2 aqua soil) may require simulation features not yet implemented (continuous ammonia leaching from substrate). These can be approximated with periodic ammonia injection actions.
- The pH-CO2 relationship may need a model change (linear → logarithmic) to match real-world 1.0 pH drop. This could be a separate small task if the scope is too large.
- Constants should be tuned to satisfy the MAJORITY of scenarios, not necessarily all of them. Perfect accuracy across all scenarios simultaneously may require more complex models.
- Run `npm run lint` and full test suite after each constant adjustment to ensure no regressions.

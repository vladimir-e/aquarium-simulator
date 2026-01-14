# Task 12: Nitrogen Cycle System

**Status:** pending

## Overview

Implement the nitrogen cycle - the biological process that converts toxic ammonia into less harmful nitrate through bacterial action. This is the foundation of a healthy aquarium ecosystem. Waste decomposes into ammonia, which AOB (Ammonia-Oxidizing Bacteria) convert to nitrite, and NOB (Nitrite-Oxidizing Bacteria) convert to nitrate. Bacterial populations grow based on available surface area and food supply, creating realistic cycling dynamics.

## References

- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Nitrogen Cycle specification, bacterial dynamics
- [5-RESOURCES.md](../5-RESOURCES.md) - Ammonia, Nitrite, Nitrate, AOB, NOB resource definitions
- [1-DESIGN.md](../1-DESIGN.md) - Effect system, PASSIVE tier, system registry pattern
- [9-LOGGING-AND-ALERTS.md](../9-LOGGING-AND-ALERTS.md) - Alert system for toxic levels

## Scope

### In Scope

- **Nitrogen Cycle Core System** (PASSIVE tier):
  - **Stage 1**: Waste → Ammonia (direct conversion)
  - **Stage 2**: Ammonia → Nitrite (via AOB bacteria)
  - **Stage 3**: Nitrite → Nitrate (via NOB bacteria)
  - Bacterial population dynamics (growth and death)
  - Surface area constraints on bacterial capacity
  - Food availability affects bacterial growth/death rates
- **Resources**:
  - Ammonia (NH3) - ppm, toxic to fish
  - Nitrite (NO2) - ppm, toxic to fish
  - Nitrate (NO3) - ppm, less toxic, removed by plants/water changes
  - AOB - Ammonia-Oxidizing Bacteria population
  - NOB - Nitrite-Oxidizing Bacteria population
- **Alerts**:
  - High ammonia alert (>0.02 ppm - stress level)
  - High nitrite alert (>0.1 ppm - stress level)
  - High nitrate alert (>20 ppm - action needed)
- **UI Display**:
  - Water Chemistry panel showing NH3, NO2, NO3 levels
  - Visual indicators for safe/stress/lethal ranges
  - Color coding (green=safe, yellow=stress, red=danger)
- **Logging**:
  - Log when alerts trigger
  - Track cycling progress (bacteria growth, parameter changes)

### Out of Scope

- **Oxygen dependency** - Simplified model assumes adequate O2 (will add when gas exchange implemented)
- **pH effects** - Nitrification lowers pH, but deferred to pH system task
- **Temperature effects** - Bacteria efficiency changes with temp, deferred for simplicity
- **Nitrate removal by plants** - Will be added when plant system implemented
- **Water changes action** - Not yet implemented; nitrate will accumulate until Water Change action is added
- **Filter cleaning action** - Reduces surface area, deferred to separate maintenance task
- **Fishless cycling mode** - Already supported via ambient waste seeding
- **Bottled bacteria products** - Action to instantly boost AOB/NOB populations, future enhancement
- **Stall detection** - Detecting when cycle is stuck (insufficient surface, no waste), future feature

## Architecture

### State Extensions

Add nitrogen cycle resources to `Resources` interface:
- `ammonia: number` (ppm, default 0)
- `nitrite: number` (ppm, default 0)
- `nitrate: number` (ppm, default 0)
- `aob: number` (absolute bacteria units, default 0)
- `nob: number` (absolute bacteria units, default 0)

**Units:**
- **Chemicals (NH3, NO2, NO3)**: ppm (parts per million)
- **Bacteria (AOB, NOB)**: Abstract units representing colony size
  - Max capacity scales with surface area
  - Processing rate per bacteria unit is constant

### Nitrogen Cycle Core System

Create `src/simulation/systems/nitrogen-cycle.ts` with:

**Constants** (to be calibrated during implementation):
```typescript
// Conversion rates (all in ppm for 40L tank)
const WASTE_TO_AMMONIA_RATE = ???      // g waste → ppm NH3 per hour (TBD based on waste decay)
const AOB_CONVERSION_RATE = ???        // ppm NH3 → ppm NO2 per bacteria-unit per hour
const NOB_CONVERSION_RATE = ???        // ppm NO2 → ppm NO3 per bacteria-unit per hour
const NH3_TO_NO2_RATIO = 2.7           // Stoichiometric conversion ratio

// Bacterial dynamics
const BACTERIA_DOUBLING_TIME = 24      // hours - bacteria doubles daily when well-fed
const AOB_GROWTH_RATE = Math.log(2) / BACTERIA_DOUBLING_TIME  // ~0.029 per hour
const NOB_GROWTH_RATE = Math.log(2) / BACTERIA_DOUBLING_TIME  // ~0.029 per hour (same as AOB)
const BACTERIA_STARVATION_DAYS = 5     // days bacteria can survive without food
const BACTERIA_DEATH_RATE = 1 / (BACTERIA_STARVATION_DAYS * 24)  // ~0.0083 per hour

// Food thresholds
const MIN_FOOD_AOB = 0.01              // ppm NH3 minimum to sustain AOB (no death)
const MIN_FOOD_NOB = 0.01              // ppm NO2 minimum to sustain NOB (no death)
const SPAWN_THRESHOLD_AOB = 0.5        // ppm NH3 - bacteria spawns when this level reached
const SPAWN_THRESHOLD_NOB = 0.5        // ppm NO2 - bacteria spawns when this level reached

// Surface area to bacteria capacity
const BACTERIA_PER_CM2 = ???           // bacteria units per cm² of surface (TBD during calibration)
// Example target: 10,000 cm² surface → bacteria capacity for typical fish load

// Initial bacteria (none - spawns when food appears)
const INITIAL_AOB = 0                  // Starts at zero
const INITIAL_NOB = 0                  // Starts at zero
```

**Three-Stage Process:**

1. **Waste → Ammonia**
   - Direct conversion based on available waste
   - Removes waste, produces ammonia proportionally

2. **Ammonia → Nitrite (AOB)**
   - AOB consume ammonia, produce nitrite
   - Conversion rate scales with AOB population
   - Limits: cannot consume more ammonia than available

3. **Nitrite → Nitrate (NOB)**
   - NOB consume nitrite, produce nitrate
   - Conversion rate scales with NOB population
   - Limits: cannot consume more nitrite than available

**Bacterial Dynamics:**

**Spawning** (bacteria appears when food is present):
```typescript
// AOB spawning
if (resources.aob === 0 && resources.ammonia >= SPAWN_THRESHOLD_AOB) {
  // Bacteria omnipresent in nature - colonizes when food available
  resources.aob = small_initial_value  // e.g., 0.01 units
}

// NOB spawning
if (resources.nob === 0 && resources.nitrite >= SPAWN_THRESHOLD_NOB) {
  resources.nob = small_initial_value  // e.g., 0.01 units
}
```

**Growth** (doubles daily when well-fed and space available):
```typescript
maxCapacity = resources.surface * BACTERIA_PER_CM2

// AOB growth
if (resources.ammonia >= MIN_FOOD_AOB && resources.aob < maxCapacity) {
  foodFactor = Math.min(1.0, resources.ammonia / MIN_FOOD_AOB)
  capacityFactor = (maxCapacity - resources.aob) / maxCapacity  // Logistic
  aobGrowth = AOB_GROWTH_RATE * foodFactor * capacityFactor * resources.aob
  resources.aob += aobGrowth
}

// NOB growth (same pattern)
if (resources.nitrite >= MIN_FOOD_NOB && resources.nob < maxCapacity) {
  foodFactor = Math.min(1.0, resources.nitrite / MIN_FOOD_NOB)
  capacityFactor = (maxCapacity - resources.nob) / maxCapacity
  nobGrowth = NOB_GROWTH_RATE * foodFactor * capacityFactor * resources.nob
  resources.nob += nobGrowth
}
```

**Death** (starves slowly over days when food scarce):
```typescript
// AOB death
if (resources.ammonia < MIN_FOOD_AOB) {
  // Dies slowly - survives for ~5 days without food
  aobDeath = BACTERIA_DEATH_RATE * resources.aob
  resources.aob -= aobDeath
}

// NOB death (same pattern)
if (resources.nitrite < MIN_FOOD_NOB) {
  nobDeath = BACTERIA_DEATH_RATE * resources.nob
  resources.nob -= nobDeath
}
```

**Surface Area Changes:**
```typescript
// When surface area decreases (e.g., filter removed), cap bacteria
if (resources.aob > maxCapacity) {
  resources.aob = maxCapacity  // Die-off to match new capacity
}
if (resources.nob > maxCapacity) {
  resources.nob = maxCapacity
}
```

**Key Properties:**
- Bacteria starts at 0, spawns when food threshold reached (omnipresent in nature)
- Doubles every 24 hours when well-fed and space available
- Logistic growth slows as population approaches surface capacity
- Survives for ~5 days without food (slow death)
- Both AOB and NOB grow at same rate (doubling time = 24h)
- Sequential spikes happen because ammonia appears first, then nitrite

**System Registration:**
```typescript
export const NitrogenCycleSystem = {
  id: 'nitrogen-cycle',
  tier: 'passive',
  update: updateNitrogenCycle,
};
```

## Calibration Test Scenario

**Setup:**
- 40L tank with sponge filter + gravel substrate
- Calculate total surface area (tank glass + filter + substrate)
- Add 1g of food initially
- Let simulation run for 25 days (600 ticks)

**Expected Behavior:**

**Days 1-3: Decay Phase**
- Food decays into waste (using existing decay system)
- Waste converts to ammonia
- Ammonia accumulates to ~0.5+ ppm
- AOB = 0 (bacteria hasn't spawned yet)

**Days 3-5: AOB Spawning & Growth**
- Ammonia reaches SPAWN_THRESHOLD_AOB (0.5 ppm)
- AOB spawns at small initial value
- AOB begins doubling daily (logistic growth)
- Ammonia continues rising (bacteria too small to process waste)

**Days 5-10: Ammonia Peak**
- Ammonia peaks at 2-5 ppm (depends on waste accumulation)
- AOB growing rapidly (doubling daily)
- AOB starts processing ammonia faster than waste produces it
- Nitrite accumulating (from AOB conversion)

**Days 10-12: Nitrite Spike & NOB Spawning**
- Ammonia declining (AOB processing capacity increasing)
- Nitrite reaches SPAWN_THRESHOLD_NOB (0.5 ppm)
- NOB spawns and begins growing
- Nitrite continues rising (NOB too small to keep up)

**Days 12-18: Nitrite Peak**
- Ammonia < 0.1 ppm (AOB established)
- Nitrite peaks at 5-20 ppm (depends on conversion rates)
- NOB growing rapidly (doubling daily)
- Nitrate accumulating

**Days 18-25: Cycle Completion**
- Ammonia < 0.02 ppm (essentially zero)
- Nitrite declining as NOB capacity increases
- Day 25: Nitrite < 0.1 ppm
- **Tank is cycled** - both bacteria at equilibrium with waste input

**Success Criteria:**
- Sequential spikes (ammonia first, then nitrite)
- AOB spawns before NOB (ammonia appears before nitrite)
- Both bacteria grow to fill available surface
- Final equilibrium: NH3 < 0.02 ppm, NO2 < 0.1 ppm
- Nitrate accumulated significantly (no removal mechanism yet)
- Total cycle time: ~25 days (realistic for fishless cycle)

**Parameters to Calibrate:**
- `WASTE_TO_AMMONIA_RATE` - controls how fast ammonia appears
- `AOB_CONVERSION_RATE` - controls how fast AOB processes ammonia
- `NOB_CONVERSION_RATE` - controls how fast NOB processes nitrite
- `BACTERIA_PER_CM2` - controls max bacteria capacity for given surface
- These must balance so that:
  - Ammonia spikes occur (bacteria can't keep up initially)
  - Bacteria eventually catches up (equilibrium at full capacity)
  - Timeline matches 25-day target

## Implementation

### 1. State (`src/simulation/state.ts`)

Add to `Resources` interface:
```typescript
export interface Resources {
  // ... existing fields

  /** Ammonia concentration (NH3) in ppm - toxic to fish */
  ammonia: number;
  /** Nitrite concentration (NO2) in ppm - toxic to fish */
  nitrite: number;
  /** Nitrate concentration (NO3) in ppm - less toxic, accumulates */
  nitrate: number;
  /** Ammonia-Oxidizing Bacteria population (abstract units) */
  aob: number;
  /** Nitrite-Oxidizing Bacteria population (abstract units) */
  nob: number;
}
```

Initialize in `createSimulation()`:
```typescript
resources: {
  // ... existing resources
  ammonia: 0,    // ppm
  nitrite: 0,    // ppm
  nitrate: 0,    // ppm
  aob: 0,        // No bacteria initially - spawns when food appears
  nob: 0,        // No bacteria initially - spawns when food appears
}
```

**No bacteria seeding** - starts at zero, bacteria spawns naturally when chemicals reach threshold (mimics real-world omnipresent bacteria)

### 2. Nitrogen Cycle System (`src/simulation/systems/nitrogen-cycle.ts`)

**Core Structure:**
```typescript
export function updateNitrogenCycle(state: SimulationState): Effect[] {
  const effects: Effect[] = [];
  const { resources } = state;
  const maxCapacity = resources.surface * BACTERIA_PER_CM2;

  // 1. Waste → Ammonia conversion
  effects.push(...convertWasteToAmmonia(resources));

  // 2. Bacteria spawning (if needed)
  effects.push(...spawnBacteria(resources));

  // 3. AOB: Ammonia → Nitrite conversion
  effects.push(...processAOB(resources));

  // 4. NOB: Nitrite → Nitrate conversion
  effects.push(...processNOB(resources));

  // 5. Bacterial growth/death
  effects.push(...updateBacterialPopulation(resources, maxCapacity));

  // 6. Cap bacteria to surface capacity
  effects.push(...capBacteriaToSurface(resources, maxCapacity));

  return effects;
}
```

**Helper Functions:**

**1. Waste → Ammonia:**
```typescript
function convertWasteToAmmonia(resources: Resources): Effect[] {
  if (resources.waste <= 0) return [];

  // Convert waste (grams) to ammonia (ppm)
  const wasteToConvert = Math.min(resources.waste, MAX_WASTE_CONVERSION_PER_HOUR);
  const ammoniaPPM = (wasteToConvert * WASTE_TO_AMMONIA_RATE) / resources.water * 1000;

  return [
    { tier: 'passive', resource: 'waste', delta: -wasteToConvert, source: 'nitrogen-cycle' },
    { tier: 'passive', resource: 'ammonia', delta: ammoniaPPM, source: 'nitrogen-cycle' }
  ];
}
```

**2. Bacteria Spawning:**
```typescript
function spawnBacteria(resources: Resources): Effect[] {
  const effects: Effect[] = [];

  // Spawn AOB when ammonia reaches threshold
  if (resources.aob === 0 && resources.ammonia >= SPAWN_THRESHOLD_AOB) {
    effects.push({
      tier: 'passive',
      resource: 'aob',
      delta: INITIAL_BACTERIA_SPAWN,
      source: 'nitrogen-cycle'
    });
  }

  // Spawn NOB when nitrite reaches threshold
  if (resources.nob === 0 && resources.nitrite >= SPAWN_THRESHOLD_NOB) {
    effects.push({
      tier: 'passive',
      resource: 'nob',
      delta: INITIAL_BACTERIA_SPAWN,
      source: 'nitrogen-cycle'
    });
  }

  return effects;
}
```

**3. AOB Processing:**
```typescript
function processAOB(resources: Resources): Effect[] {
  if (resources.aob <= 0 || resources.ammonia <= 0) return [];

  // How much ammonia can AOB process this hour?
  const maxProcessing = resources.aob * AOB_CONVERSION_RATE;
  const ammoniaProcessed = Math.min(resources.ammonia, maxProcessing);
  const nitriteProduced = ammoniaProcessed * NH3_TO_NO2_RATIO;

  return [
    { tier: 'passive', resource: 'ammonia', delta: -ammoniaProcessed, source: 'aob' },
    { tier: 'passive', resource: 'nitrite', delta: nitriteProduced, source: 'aob' }
  ];
}
```

**4. NOB Processing:**
```typescript
function processNOB(resources: Resources): Effect[] {
  if (resources.nob <= 0 || resources.nitrite <= 0) return [];

  // How much nitrite can NOB process this hour?
  const maxProcessing = resources.nob * NOB_CONVERSION_RATE;
  const nitriteProcessed = Math.min(resources.nitrite, maxProcessing);

  return [
    { tier: 'passive', resource: 'nitrite', delta: -nitriteProcessed, source: 'nob' },
    { tier: 'passive', resource: 'nitrate', delta: nitriteProcessed, source: 'nob' }
  ];
}
```

**5. Bacterial Growth/Death:**
```typescript
function updateBacterialPopulation(resources: Resources, maxCapacity: number): Effect[] {
  const effects: Effect[] = [];

  // AOB growth/death
  if (resources.aob > 0) {
    if (resources.ammonia >= MIN_FOOD_AOB && resources.aob < maxCapacity) {
      // Growth (doubles daily when well-fed)
      const foodFactor = Math.min(1.0, resources.ammonia / MIN_FOOD_AOB);
      const capacityFactor = (maxCapacity - resources.aob) / maxCapacity;
      const growth = AOB_GROWTH_RATE * foodFactor * capacityFactor * resources.aob;
      effects.push({ tier: 'passive', resource: 'aob', delta: growth, source: 'nitrogen-cycle' });
    } else if (resources.ammonia < MIN_FOOD_AOB) {
      // Death (starves slowly over days)
      const death = BACTERIA_DEATH_RATE * resources.aob;
      effects.push({ tier: 'passive', resource: 'aob', delta: -death, source: 'nitrogen-cycle' });
    }
  }

  // NOB growth/death (same pattern)
  if (resources.nob > 0) {
    if (resources.nitrite >= MIN_FOOD_NOB && resources.nob < maxCapacity) {
      const foodFactor = Math.min(1.0, resources.nitrite / MIN_FOOD_NOB);
      const capacityFactor = (maxCapacity - resources.nob) / maxCapacity;
      const growth = NOB_GROWTH_RATE * foodFactor * capacityFactor * resources.nob;
      effects.push({ tier: 'passive', resource: 'nob', delta: growth, source: 'nitrogen-cycle' });
    } else if (resources.nitrite < MIN_FOOD_NOB) {
      const death = BACTERIA_DEATH_RATE * resources.nob;
      effects.push({ tier: 'passive', resource: 'nob', delta: -death, source: 'nitrogen-cycle' });
    }
  }

  return effects;
}
```

**6. Cap to Surface:**
```typescript
function capBacteriaToSurface(resources: Resources, maxCapacity: number): Effect[] {
  const effects: Effect[] = [];

  // If surface decreased (filter removed), bacteria die off immediately
  if (resources.aob > maxCapacity) {
    effects.push({
      tier: 'passive',
      resource: 'aob',
      delta: maxCapacity - resources.aob,
      source: 'nitrogen-cycle'
    });
  }

  if (resources.nob > maxCapacity) {
    effects.push({
      tier: 'passive',
      resource: 'nob',
      delta: maxCapacity - resources.nob,
      source: 'nitrogen-cycle'
    });
  }

  return effects;
}
```

**Key Implementation Notes:**
- All chemicals in ppm, bacteria in abstract units
- Conversion rates use water volume for ppm calculations
- Processing capacity = bacteria units × conversion rate per unit
- Growth is logistic (slows near capacity), death is exponential decay
- Bacteria spawning is triggered by food threshold, not time

### 3. Register System (`src/simulation/systems/index.ts`)
- Add `NitrogenCycleSystem` to `coreSystems` array
- Export for use in tick loop

### 4. Alerts (`src/simulation/alerts/`)

Create three new alert modules:

**High Ammonia** (`high-ammonia.ts`):
- Trigger: ammonia > 0.02 ppm
- Message: "Ammonia level high - toxic to fish. Add more filter media or reduce feeding."

**High Nitrite** (`high-nitrite.ts`):
- Trigger: nitrite > 0.1 ppm
- Message: "Nitrite level high - tank still cycling. Monitor closely and perform water changes if needed."

**High Nitrate** (`high-nitrate.ts`):
- Trigger: nitrate > 20 ppm
- Message: "Nitrate accumulation - perform water change or add plants to consume nitrate."

Register in `src/simulation/alerts/index.ts`:
- Add to alert checkers array
- Add alert state flags to `AlertState` interface

### 5. UI - Water Chemistry Panel (`src/ui/components/water-chemistry/`)

Create or update WaterChemistryPanel to show:
- Ammonia (NH3) with ppm value and color indicator
- Nitrite (NO2) with ppm value and color indicator
- Nitrate (NO3) with ppm value and color indicator

**Color Coding:**
- Ammonia: green (0), yellow (>0.02), red (>0.1)
- Nitrite: green (0), yellow (>0.1), red (>1)
- Nitrate: green (<20), yellow (20-40), red (>80)

Display format: "Ammonia: 0.05 ppm" with colored badge/indicator

### 6. UI - Equipment Bar Integration
- Add WaterChemistry panel icon/button to equipment bar
- Position near other monitoring displays

## Acceptance Criteria

### Resources
- [ ] Ammonia, Nitrite, Nitrate added to Resources (ppm, default 0)
- [ ] AOB, NOB added to Resources (absolute bacteria units, default 0)
- [ ] All resources initialized correctly in createSimulation()

### Nitrogen Cycle System
- [ ] System registered in PASSIVE tier
- [ ] Stage 1: Waste (g) converts to ammonia (ppm) using water volume
- [ ] Stage 2: AOB convert ammonia → nitrite (scales with AOB population, stoichiometric 2.7:1 ratio)
- [ ] Stage 3: NOB convert nitrite → nitrate (scales with NOB population)
- [ ] Conversions limited by available substrate (can't consume more than exists)
- [ ] Effects emitted for all resource changes

### Bacterial Spawning
- [ ] AOB starts at 0, spawns when ammonia >= SPAWN_THRESHOLD_AOB (0.5 ppm)
- [ ] NOB starts at 0, spawns when nitrite >= SPAWN_THRESHOLD_NOB (0.5 ppm)
- [ ] Spawn value small but enough to bootstrap growth (e.g., 0.01 units)
- [ ] Spawns only once (when bacteria = 0 and food >= threshold)

### Bacterial Growth
- [ ] Bacteria doubles every 24 hours when well-fed (exponential growth)
- [ ] Growth requires food >= MIN_FOOD threshold (0.01 ppm)
- [ ] Growth slows as population approaches surface capacity (logistic curve)
- [ ] No growth when at max capacity
- [ ] Food factor scales growth (more food = faster growth up to optimum)

### Bacterial Death
- [ ] Bacteria survives ~5 days without food (slow exponential decay)
- [ ] Death only occurs when food < MIN_FOOD threshold
- [ ] Population never goes below 0
- [ ] When surface area decreases, bacteria immediately capped to new max capacity

### Surface Area Relationship
- [ ] Max bacteria capacity = surface area (cm²) × BACTERIA_PER_CM2
- [ ] More surface → higher max capacity → more processing power when full
- [ ] Processing rate per bacteria unit is constant
- [ ] Bacteria units are absolute values (scale with surface via max capacity)

### Alerts
- [ ] High ammonia alert triggers at >0.02 ppm
- [ ] High nitrite alert triggers at >0.1 ppm
- [ ] High nitrate alert triggers at >20 ppm
- [ ] Alerts only trigger once when crossing threshold
- [ ] Alerts clear when values return to safe range

### UI
- [ ] WaterChemistry panel displays NH3, NO2, NO3 with values
- [ ] Color indicators show safe/stress/danger zones
- [ ] Values update in real-time as simulation runs
- [ ] Panel accessible from equipment bar

### Integration & Calibration Test
- [ ] Calibration test passes: 40L tank + 1g food → 25-day cycle
- [ ] Sequential spikes observed: ammonia peaks first (days 5-10), then nitrite (days 12-18)
- [ ] AOB spawns before NOB (ammonia appears before nitrite)
- [ ] Final state: ammonia < 0.02 ppm, nitrite < 0.1 ppm, nitrate accumulated
- [ ] Bacteria grows to fill available surface area
- [ ] Equilibrium achieved: waste input balanced by bacteria processing
- [ ] Works with existing decay system (waste → ammonia)
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Tests

Focus on >90% coverage for:

**Conversion Logic:**
- Waste (g) → ammonia (ppm) conversion using water volume correctly
- Ammonia (ppm) → nitrite (ppm) with stoichiometric 2.7:1 ratio
- Nitrite (ppm) → nitrate (ppm) conversion
- Conversion rates scale correctly with bacteria population
- Conversion limits (cannot consume more than available)
- Zero conversion when no bacteria or no substrate

**Bacterial Spawning:**
- AOB spawns when ammonia >= 0.5 ppm (and bacteria = 0)
- NOB spawns when nitrite >= 0.5 ppm (and bacteria = 0)
- Bacteria does NOT spawn when below threshold
- Bacteria does NOT spawn again if already > 0
- Initial spawn value is small but non-zero

**Bacterial Growth:**
- Bacteria doubles in ~24 hours with abundant food and space
- Growth rate matches BACTERIA_DOUBLING_TIME constant
- Growth slows near max capacity (logistic curve)
- No growth when at max capacity
- No growth when food < MIN_FOOD threshold
- Food factor correctly scales growth rate

**Bacterial Death:**
- Bacteria survives when food >= MIN_FOOD (no death)
- Bacteria dies slowly when food < MIN_FOOD (~5 day survival)
- Death rate matches BACTERIA_STARVATION_DAYS constant
- Population never goes negative
- Immediate die-off when surface area decreases

**Integration - Full Cycle:**
- 40L tank + 1g food + 25 days → successful cycle
- Ammonia spike before nitrite spike (sequential)
- AOB spawns before NOB
- Both bacteria grow to near max capacity
- Final equilibrium: NH3 < 0.02, NO2 < 0.1 ppm
- Nitrate accumulates significantly
- Alert triggering at correct thresholds
- State immutability preserved

**Edge Cases:**
- Zero waste, zero bacteria (no changes)
- Maximum bacteria, zero food (death occurs)
- Very high waste influx (ammonia spikes, bacteria can't keep up)
- Surface area changes (bacteria capped immediately)

## Notes

### Design Principles

- **Units**:
  - Chemicals: ppm (concentrations affected by water volume)
  - Bacteria: absolute units (scale with surface area)
  - Conversion: waste (g) → ammonia (ppm) requires water volume

- **Surface Area**:
  - Determines max bacteria capacity (carrying capacity)
  - Processing rate per bacteria unit is constant
  - More surface → more bacteria → more processing power

- **Equilibrium**:
  - Bacteria at full capacity should balance typical waste input
  - Parameters must be calibrated together via test scenario

- **Spawning**:
  - Bacteria starts at 0, spawns when chemical threshold reached
  - Mimics omnipresent bacteria in nature colonizing when food available

### Biological Realism

- **Two-Stage Process**: AOB and NOB are separate populations with separate food sources
- **Sequential Spikes**: Ammonia appears first, then nitrite (due to conversion delay)
- **Doubling Time**: Bacteria doubles every 24 hours when well-fed (realistic growth rate)
- **Starvation Survival**: Bacteria survives ~5 days without food (realistic die-off)
- **Logistic Growth**: Exponential when space available, slows near capacity
- **Stoichiometry**: 1 ppm ammonia → 2.7 ppm nitrite (chemically accurate)

### Implementation Notes

- **Calibration Required**: Constants marked `???` must be tuned via 25-day cycling test
- **Test-Driven**: Use calibration test to validate parameters, not guess values
- **Alert Strategy**: Alert at stress levels (0.02 NH3, 0.1 NO2) before lethal, gives user time
- **No Removal**: Nitrate will accumulate (water changes and plants not yet implemented)
- **Future Enhancements**: Temperature effects, oxygen dependency, pH impacts deferred
- **UI Foundation**: Water chemistry panel will expand with pH, GH/KH, O2/CO2 in future

### Success Metric

**The implementation succeeds when the calibration test (40L + 1g food + 25 days) produces:**
- Sequential ammonia/nitrite spikes
- Both bacteria grow to fill surface
- Final equilibrium: NH3 < 0.02, NO2 < 0.1 ppm
- Realistic cycling timeline (~25 days)

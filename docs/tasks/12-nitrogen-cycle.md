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
- `aob: number` (bacteria population, 0-1 scale representing % of max capacity)
- `nob: number` (bacteria population, 0-1 scale representing % of max capacity)

### Nitrogen Cycle Core System

Create `src/simulation/systems/nitrogen-cycle.ts` with:

**Constants** (calibrated from research on real aquarium cycling):
```typescript
// Conversion rates (all in grams)
const WASTE_TO_AMMONIA_RATE = 0.10      // g waste → g NH3 per hour
const AOB_CONVERSION_RATE = 0.00012     // g NH3 → g NO2 per bacteria-unit per hour
const NOB_CONVERSION_RATE = 0.00010     // g NO2 → g NO3 per bacteria-unit per hour
const NH3_TO_NO2_RATIO = 2.7            // Stoichiometric conversion ratio

// Bacterial dynamics (AOB grows faster than NOB - creates sequential spikes)
const AOB_GROWTH_RATE = 0.069           // ~10h doubling time (ln(2)/10h)
const NOB_GROWTH_RATE = 0.023           // ~30h doubling time (ln(2)/30h)
const AOB_DEATH_RATE = 0.012            // ~58h half-life when starving
const NOB_DEATH_RATE = 0.015            // ~46h half-life when starving
const MIN_FOOD_AOB = 0.001              // g NH3 minimum to sustain AOB
const MIN_FOOD_NOB = 0.001              // g NO2 minimum to sustain NOB

// Surface area to bacteria capacity
const BACTERIA_PER_CM2 = 0.0001         // bacteria units per cm² of surface
// Example: 10,000 cm² surface → max 1.0 bacteria units each (AOB, NOB)

// Initial seed populations (for new tank)
const INITIAL_AOB_FRACTION = 0.001      // 0.1% of max capacity
const INITIAL_NOB_FRACTION = 0.0005     // 0.05% of max capacity
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

**Bacterial Growth/Death (Logistic Growth Model):**

For AOB:
```typescript
maxCapacity = passiveResources.surface * BACTERIA_PER_CM2
foodFactor = Math.min(1.0, resources.ammonia / MIN_FOOD_AOB)
capacityFactor = Math.max(0, 1 - resources.aob / maxCapacity)

aobGrowth = AOB_GROWTH_RATE * foodFactor * capacityFactor * resources.aob
aobDeath = AOB_DEATH_RATE * (1 - foodFactor) * resources.aob
aobChange = aobGrowth - aobDeath
```

For NOB (same pattern, different rates):
```typescript
foodFactor = Math.min(1.0, resources.nitrite / MIN_FOOD_NOB)
capacityFactor = Math.max(0, 1 - resources.nob / maxCapacity)

nobGrowth = NOB_GROWTH_RATE * foodFactor * capacityFactor * resources.nob
nobDeath = NOB_DEATH_RATE * (1 - foodFactor) * resources.nob
nobChange = nobGrowth - nobDeath
```

**Key Properties:**
- Exponential growth when food abundant and space available
- Growth slows as population approaches surface capacity (logistic curve)
- Bacteria die when food drops below minimum threshold
- AOB grows 3x faster than NOB (creates sequential ammonia → nitrite spikes)

**System Registration:**
```typescript
export const NitrogenCycleSystem = {
  id: 'nitrogen-cycle',
  tier: 'passive',
  update: updateNitrogenCycle,
};
```

## Expected Cycling Timeline (Calibration Target)

These calibrated parameters produce realistic fishless cycling for a 40L tank with 10,000 cm² surface area:

| Day | NH3 (ppm) | NO2 (ppm) | NO3 (ppm) | AOB % | NOB % | Status |
|-----|-----------|-----------|-----------|-------|-------|--------|
| 1   | 0.6       | 0.0       | 0.0       | 1.5   | 0.05  | Starting |
| 3   | 4.5       | 3.8       | 0.5       | 35    | 5     | **NH3 peak** |
| 7   | 0.5       | 23.8      | 11.3      | 85    | 35    | **NO2 peak** |
| 10  | 0.2       | 18.5      | 28.0      | 90    | 58    | NO2 plateau |
| 14  | 0.1       | 8.0       | 52.5      | 88    | 78    | NO2 declining |
| 17  | 0.06      | 2.5       | 75.0      | 86    | 86    | Near complete |
| 21  | 0.025     | 0.025     | 112.5     | 82    | 90    | **CYCLED** ✓ |

**Key Milestones:**
- **Ammonia spike**: Days 3-4 (peaks ~4.5 ppm)
- **Ammonia drop**: Day 7 (AOB established at 85%)
- **Nitrite spike**: Days 7-10 (peaks ~24 ppm)
- **Cycle complete**: Day 21 (both NH3 and NO2 < 0.05 ppm)

**Validation Criteria:**
- Total cycle time: 21 days (504 hours)
- Sequential spikes (ammonia first, then nitrite)
- AOB grows faster and establishes before NOB
- Final nitrate accumulation: ~110 ppm (high, needs water change)

## Implementation

### 1. State (`src/simulation/state.ts`)
- Add nitrogen cycle resources to `Resources` interface:
  - `ammonia: number` (g, default 0)
  - `nitrite: number` (g, default 0)
  - `nitrate: number` (g, default 0)
  - `aob: number` (bacteria units, default: maxCapacity * 0.001)
  - `nob: number` (bacteria units, default: maxCapacity * 0.0005)
- Initialize chemical resources to 0, bacteria to seed populations in `createSimulation()`
- Calculate max bacteria capacity: `maxCapacity = totalSurface * BACTERIA_PER_CM2`

### 2. Nitrogen Cycle System (`src/simulation/systems/nitrogen-cycle.ts`)

**Main update function:**
```typescript
function updateNitrogenCycle(state: SimulationState): Effect[] {
  const effects: Effect[] = [];

  // Stage 1: Waste → Ammonia
  const wasteConverted = calculateWasteConversion(state);
  if (wasteConverted > 0) {
    effects.push({ tier: 'passive', resource: 'waste', delta: -wasteConverted, source: 'nitrogen-cycle' });
    effects.push({ tier: 'passive', resource: 'ammonia', delta: wasteConverted * WASTE_TO_AMMONIA_RATE, source: 'nitrogen-cycle' });
  }

  // Stage 2: Ammonia → Nitrite (AOB)
  const ammoniaConverted = calculateAOBConversion(state);
  if (ammoniaConverted > 0) {
    effects.push({ tier: 'passive', resource: 'ammonia', delta: -ammoniaConverted, source: 'aob' });
    effects.push({ tier: 'passive', resource: 'nitrite', delta: ammoniaConverted, source: 'aob' });
  }

  // Stage 3: Nitrite → Nitrate (NOB)
  const nitriteConverted = calculateNOBConversion(state);
  if (nitriteConverted > 0) {
    effects.push({ tier: 'passive', resource: 'nitrite', delta: -nitriteConverted, source: 'nob' });
    effects.push({ tier: 'passive', resource: 'nitrate', delta: nitriteConverted, source: 'nob' });
  }

  // Bacterial population dynamics
  const aobChange = calculateBacteriaChange(state.resources.aob, state.resources.ammonia);
  const nobChange = calculateBacteriaChange(state.resources.nob, state.resources.nitrite);

  if (aobChange !== 0) {
    effects.push({ tier: 'passive', resource: 'aob', delta: aobChange, source: 'nitrogen-cycle' });
  }
  if (nobChange !== 0) {
    effects.push({ tier: 'passive', resource: 'nob', delta: nobChange, source: 'nitrogen-cycle' });
  }

  return effects;
}
```

**Helper functions:**
- `calculateWasteConversion(state)` - How much waste converts to ammonia this tick
- `calculateAOBConversion(state)` - How much ammonia AOB can process
- `calculateNOBConversion(state)` - How much nitrite NOB can process
- `calculateBacteriaChange(population, food)` - Net growth/death for bacteria
- `calculateFoodAvailability(currentFood)` - 0-1 scale of food adequacy

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

## Calibration & Tuning

### Realistic Cycling Timeline

**New Tank (Fishless Cycle):**
- Days 1-7: Waste accumulates from ambient waste, ammonia rises, AOB begin growing
- Days 7-14: AOB population established, ammonia drops, nitrite spikes, NOB begin growing
- Days 14-21: NOB population established, nitrite drops, nitrate accumulates
- Day 21+: Cycle complete, safe for fish

**With Fish (Risky):**
- Fish produce waste immediately → rapid ammonia spike
- Without established bacteria → toxic conditions
- Requires daily water changes to keep fish safe

**Growth Rate Calibration:**
- BACTERIA_GROWTH_RATE = 0.05 → bacteria double in ~14 hours when well-fed
- Allows realistic 2-3 week cycling period
- Fast enough to be interesting, slow enough to require user attention

### Waste Production Rate Matching

Current decay system produces waste from:
- Ambient waste: 0.01 g/hour
- Uneaten food decay: varies

Nitrogen cycle should consume waste at comparable rate when bacteria established, creating equilibrium.

## Acceptance Criteria

### Resources
- [ ] Ammonia, Nitrite, Nitrate added to Resources (ppm, default 0)
- [ ] AOB, NOB added to Resources (0-1 scale, default 0)
- [ ] All resources initialized correctly in createSimulation()

### Nitrogen Cycle System
- [ ] System registered in PASSIVE tier
- [ ] Stage 1: Waste converts to ammonia at defined rate
- [ ] Stage 2: AOB convert ammonia to nitrite (scales with AOB population)
- [ ] Stage 3: NOB convert nitrite to nitrate (scales with NOB population)
- [ ] Conversions limited by available substrate (can't consume more than exists)
- [ ] Bacterial growth when food abundant (ammonia for AOB, nitrite for NOB)
- [ ] Bacterial death when food scarce
- [ ] Bacteria population capped at 1.0 (100% of surface capacity)
- [ ] Effects emitted for all resource changes

### Bacterial Dynamics
- [ ] AOB grow when ammonia > MIN_FOOD_FOR_SURVIVAL
- [ ] NOB grow when nitrite > MIN_FOOD_FOR_SURVIVAL
- [ ] Bacteria die when food < MIN_FOOD_FOR_SURVIVAL
- [ ] Growth rate follows logistic curve (slows as population approaches capacity)
- [ ] Population never exceeds 1.0 or goes below 0.0

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

### Integration
- [ ] Works with existing waste production (decay system)
- [ ] Works with ambient waste seeding (fishless cycle)
- [ ] Bacteria utilize surface area from passiveResources
- [ ] Full cycling simulation (0 → ammonia spike → nitrite spike → nitrate accumulation)
- [ ] Realistic 2-3 week cycling timeline
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Tests

Focus on >90% coverage for:

**Conversion Logic:**
- Waste → ammonia conversion with various waste amounts
- Ammonia → nitrite conversion with various AOB populations
- Nitrite → nitrate conversion with various NOB populations
- Conversion limits (cannot consume more than available)
- Zero conversion when no substrate available

**Bacterial Dynamics:**
- Growth with abundant food
- Death with scarce food
- Population capping at 1.0
- Logistic growth curve (slows near capacity)
- Both AOB and NOB behave correctly

**Integration:**
- Multi-tick simulation showing full cycling process
- Ammonia spike → nitrite spike → nitrate accumulation sequence
- Bacterial populations grow in correct order (AOB first, then NOB)
- Alert triggering at correct thresholds
- State immutability preserved

**Edge Cases:**
- Zero waste, zero bacteria (no changes)
- Maximum bacteria, no food (death occurs)
- Very high waste influx (bacteria can't keep up)

## Notes

- **Two-Stage Bacterial Process**: AOB and NOB are separate populations with separate food sources, creating realistic cycling dynamics where nitrite spike follows ammonia spike
- **Surface Area Dependency**: Bacteria capacity scales with passiveResources.surface, making filtration critical for cycling
- **Fishless Cycling**: Ambient waste (0.01 g/hour) provides seed material for bacteria establishment without fish
- **Population Scale**: Bacteria units scale with surface area (0.0001 units/cm²); 10,000 cm² → 1.0 max units
- **Growth Formula**: Logistic growth ensures realistic population dynamics (rapid at first, slowing near capacity)
- **Conversion Rates**: Tuned so established bacteria can process waste from small fish load, but get overwhelmed if overstocked
- **Alert Strategy**: Alert at stress levels (0.02 NH3, 0.1 NO2) before reaching lethal levels, giving user time to react
- **Future Enhancements**: Temperature effects, oxygen dependency, pH impacts will be added in separate tasks
- **Nitrate Accumulation**: No removal mechanism yet (water changes and plants not implemented); nitrate will accumulate over time
- **Real-World Accuracy**: Simplified but captures core cycling behavior - educators could use this to teach nitrogen cycle
- **UI Design**: Water chemistry panel is foundational - will expand with pH, GH/KH, O2/CO2 in future tasks
- **Parameter Calibration**: All constants calibrated from research on real aquarium cycling timelines, bacterial growth rates (AOB doubling: ~10h, NOB doubling: ~30h), and biofilter processing capacity. Sources include aquarium science literature, fishless cycling guides, and scientific studies on nitrifying bacteria dynamics
- **Units**: All chemical resources stored in grams (not ppm) to avoid volume-dependent calculations; convert to ppm only for display using `ppm = (grams / liters) * 1000`

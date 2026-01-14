# Task 12: Nitrogen Cycle System

**Status:** pending

## Overview

Implement the nitrogen cycle - the biological process that converts toxic waste into less harmful compounds via bacterial action. This is the core biochemistry that makes an aquarium viable for fish.

## References

- `docs/4-CORE-SYSTEMS.md` - Nitrogen cycle specification
- `docs/5-RESOURCES.md` - Resource definitions for ammonia, nitrite, nitrate, AOB, NOB
- `src/simulation/systems/decay.ts` - Pattern reference for core systems

## Scope

### In Scope

1. **5 new resources:** ammonia, nitrite, nitrate, AOB (bacteria), NOB (bacteria)
2. **Nitrogen cycle system** with three conversion stages
3. **Bacterial dynamics:** spawning, growth, death, surface cap
4. **Alerts:** high ammonia, high nitrite, high nitrate
5. **UI updates:** WaterChemistry panel showing all nitrogen cycle parameters
6. **Integration test:** 25-day cycling scenario

### Out of Scope

- O2 consumption by bacteria (no gas exchange yet)
- Dilution effects on concentrations (separate task)
- pH changes from nitrification

## Data Model

### New Resources

Add to `Resources` interface in `state.ts`:

```typescript
// Chemical resources (ppm - concentration in water)
ammonia: number;   // NH3, toxic, 0 is safe
nitrite: number;   // NO2, toxic, 0 is safe
nitrate: number;   // NO3, accumulates, <20 ppm safe

// Biological resources (absolute population values)
aob: number;       // Ammonia-oxidizing bacteria
nob: number;       // Nitrite-oxidizing bacteria
```

### Resource Definitions

Create resource definition files with these properties:

| Resource | Unit | Default | Bounds | Safe | Stress | Danger |
|----------|------|---------|--------|------|--------|--------|
| ammonia | ppm | 0 | [0, 10] | 0 | 0.02-0.05 | >0.1 |
| nitrite | ppm | 0 | [0, 10] | 0 | 0.1-0.5 | >1.0 |
| nitrate | ppm | 0 | [0, 200] | <20 | 20-40 | >80 |
| aob | units | 0 | [0, ∞] | n/a | n/a | n/a |
| nob | units | 0 | [0, ∞] | n/a | n/a | n/a |

### Alert State

Add to `AlertState` interface:

```typescript
highAmmonia: boolean;   // ammonia > 0.1 ppm
highNitrite: boolean;   // nitrite > 1.0 ppm
highNitrate: boolean;   // nitrate > 80 ppm
```

## Nitrogen Cycle Logic

The system runs in **PASSIVE tier** and processes three stages sequentially each tick.

### Stage 1: Waste → Ammonia (Mineralization)

Organic waste gradually converts to dissolved ammonia.

```
conversion_rate = 0.3  // 30% of waste converts per tick
ammonia_per_gram = 1.0 / water_volume  // ppm per gram

waste_converted = waste * conversion_rate
ammonia_produced = waste_converted * ammonia_per_gram

Effects:
  waste: -waste_converted
  ammonia: +ammonia_produced
```

**Key insight:** Ammonia is a concentration (ppm), so the same mass of waste produces higher ammonia in smaller tanks.

### Stage 2: Ammonia → Nitrite (AOB Bacteria)

AOB bacteria consume ammonia and produce nitrite.

```
processing_rate = 0.002  // ppm processed per bacteria unit per tick
ammonia_processed = min(aob * processing_rate, ammonia)

Effects:
  ammonia: -ammonia_processed
  nitrite: +ammonia_processed  // 1:1 conversion ratio
```

### Stage 3: Nitrite → Nitrate (NOB Bacteria)

NOB bacteria consume nitrite and produce nitrate.

```
processing_rate = 0.002  // ppm processed per bacteria unit per tick
nitrite_processed = min(nob * processing_rate, nitrite)

Effects:
  nitrite: -nitrite_processed
  nitrate: +nitrite_processed  // 1:1 conversion ratio
```

## Bacterial Dynamics

Bacteria follow these rules each tick, **after** the conversion stages.

### Constants

```typescript
// Spawning
const AOB_SPAWN_THRESHOLD = 0.5;    // ppm ammonia to trigger AOB spawn
const NOB_SPAWN_THRESHOLD = 0.5;    // ppm nitrite to trigger NOB spawn
const SPAWN_AMOUNT = 10;            // initial bacteria when spawning

// Growth (logistic)
const AOB_GROWTH_RATE = 0.03;       // ~doubles per day (24 ticks)
const NOB_GROWTH_RATE = 0.025;      // slower than AOB (~30 hours to double)
const BACTERIA_PER_CM2 = 0.1;       // max bacteria per cm² surface

// Death
const BACTERIA_DEATH_RATE = 0.02;   // 2% die per tick without food
const AOB_FOOD_THRESHOLD = 0.01;    // min ammonia to sustain AOB
const NOB_FOOD_THRESHOLD = 0.01;    // min nitrite to sustain NOB
```

### Spawning

Bacteria spawn from zero when their food source reaches threshold:

```
if aob == 0 AND ammonia >= AOB_SPAWN_THRESHOLD:
  aob = SPAWN_AMOUNT

if nob == 0 AND nitrite >= NOB_SPAWN_THRESHOLD:
  nob = SPAWN_AMOUNT
```

### Growth

Bacteria grow logistically when food is available:

```
max_bacteria = surface * BACTERIA_PER_CM2

// AOB grows if ammonia available
if ammonia >= AOB_FOOD_THRESHOLD:
  aob_growth = aob * AOB_GROWTH_RATE * (1 - aob / max_bacteria)
  aob = min(aob + aob_growth, max_bacteria)

// NOB grows if nitrite available
if nitrite >= NOB_FOOD_THRESHOLD:
  nob_growth = nob * NOB_GROWTH_RATE * (1 - nob / max_bacteria)
  nob = min(nob + nob_growth, max_bacteria)
```

### Death

Bacteria die when food is scarce:

```
if ammonia < AOB_FOOD_THRESHOLD:
  aob = aob * (1 - BACTERIA_DEATH_RATE)

if nitrite < NOB_FOOD_THRESHOLD:
  nob = nob * (1 - BACTERIA_DEATH_RATE)
```

### Surface Area Reduction

When surface area decreases (filter cleaning, hardscape removal), bacteria are immediately reduced:

```
max_bacteria = surface * BACTERIA_PER_CM2
aob = min(aob, max_bacteria)
nob = min(nob, max_bacteria)
```

This happens at the **start** of the nitrogen cycle update, before other calculations.

## Implementation

### File Structure

```
src/simulation/
├── resources/
│   ├── ammonia.ts       # ResourceDefinition
│   ├── nitrite.ts       # ResourceDefinition
│   ├── nitrate.ts       # ResourceDefinition
│   ├── aob.ts           # ResourceDefinition
│   ├── nob.ts           # ResourceDefinition
│   └── index.ts         # Update registry
├── systems/
│   ├── nitrogen-cycle.ts    # Core system
│   ├── nitrogen-cycle.test.ts
│   └── index.ts         # Register system
├── alerts/
│   ├── high-ammonia.ts
│   ├── high-nitrite.ts
│   ├── high-nitrate.ts
│   └── index.ts         # Register alerts
└── state.ts             # Update Resources & AlertState interfaces
```

### System Implementation

Create `nitrogen-cycle.ts`:

1. Export constants (for testing)
2. Export helper functions: `calculateMaxBacteria`, `calculateBacterialGrowth`, etc.
3. Export `nitrogenCycleSystem: System` with tier `'passive'`

The `update()` method should:
1. Cap bacteria to current surface area (handle surface reduction)
2. Run Stage 1: waste → ammonia
3. Run Stage 2: ammonia → nitrite (via AOB)
4. Run Stage 3: nitrite → nitrate (via NOB)
5. Handle bacteria spawning
6. Handle bacteria growth
7. Handle bacteria death
8. Return all effects

### Alert Implementation

Each alert follows the existing pattern in `src/simulation/alerts/`:

```typescript
// high-ammonia.ts
export const highAmmoniaAlert: AlertModule = {
  id: 'highAmmonia',
  check(state) {
    return state.resources.ammonia > 0.1;
  },
  message: 'High ammonia level detected (>0.1 ppm)',
  severity: 'warning',
};
```

### UI Updates

Update `WaterChemistry.tsx` to show:

1. **Ammonia** - value with color: green (0), yellow (0.02-0.05), red (>0.1)
2. **Nitrite** - value with color: green (0), yellow (0.1-0.5), red (>1.0)
3. **Nitrate** - value with color: green (<20), yellow (20-40), red (>80)
4. **AOB/NOB populations** - simple display showing bacteria levels
5. **Expandable details** showing conversion rates (similar to existing waste breakdown)

## Acceptance Criteria

1. **Resources initialize to zero:** New tank starts with ammonia=0, nitrite=0, nitrate=0, aob=0, nob=0
2. **Waste converts to ammonia:** Adding waste increases ammonia over time
3. **Bacteria spawn correctly:** AOB appears when ammonia hits threshold, NOB when nitrite hits threshold
4. **Bacteria process chemicals:** Active bacteria reduce their food source
5. **Bacteria grow logistically:** Population approaches surface-limited maximum
6. **Bacteria die without food:** Population declines when chemicals depleted
7. **Surface cap enforced:** Bacteria cannot exceed `surface * BACTERIA_PER_CM2`
8. **Surface reduction works:** Removing filter/hardscape immediately caps bacteria
9. **Alerts fire correctly:** Warnings when chemicals exceed danger thresholds
10. **UI displays all parameters:** WaterChemistry shows ammonia, nitrite, nitrate, bacteria

## Tests

### Unit Tests

Test individual functions:
- `calculateMaxBacteria(surface)`
- Waste → ammonia conversion math
- Bacteria spawning logic
- Bacteria growth formula
- Bacteria death formula
- Surface cap enforcement

### Integration Test: 25-Day Cycling Scenario

Simulate a realistic tank cycling:

**Setup:**
- 40L tank, 25°C
- No fish (fishless cycle)
- Add 1g food at tick 0 (simulates ammonia source)
- Run for 600 ticks (25 days)

**Expected Timeline:**
1. Days 1-3: Food decays to waste, waste converts to ammonia
2. Days 3-5: Ammonia rises, AOB spawns at 0.5 ppm threshold
3. Days 5-10: Ammonia peaks (~2-4 ppm), AOB growing
4. Days 8-12: Nitrite appears as AOB processes ammonia
5. Days 10-15: Ammonia declining, nitrite rising, NOB spawns
6. Days 12-18: Nitrite peaks, NOB growing
7. Days 18-25: Both ammonia and nitrite near zero, nitrate accumulated
8. Day 25: Tank is "cycled" - bacteria populations stable

**Assertions:**
- Ammonia peaks before nitrite peaks
- Both ammonia and nitrite eventually drop below 0.1 ppm
- Nitrate accumulates (should be 5-20 ppm range)
- AOB and NOB populations > 0 at end
- No chemical exceeds bounds at any point

## Notes

### Constant Calibration

The constants in this task are starting points. The 25-day integration test will reveal if they produce realistic behavior. Adjust as needed to match expected cycling timeline:

- If ammonia doesn't spike enough: reduce `AOB_GROWTH_RATE`
- If cycle takes too long: increase growth rates
- If bacteria die too fast: reduce `BACTERIA_DEATH_RATE`
- If bacteria cap too quickly: reduce `BACTERIA_PER_CM2`

### Why Waste → Ammonia is Gradual

The 30% conversion rate creates a buffer between organic waste and dissolved ammonia. This is realistic (decomposition takes time) and provides gameplay value (waste accumulation is visible before ammonia spike).

### Volume Dependency

Ammonia, nitrite, and nitrate are concentrations (ppm). The same mass of waste produces higher concentrations in smaller tanks. This naturally models why small tanks are harder to maintain - exactly the realistic behavior we want.

### Future Integration Points

When livestock is implemented:
- Fish metabolism will add to waste directly (bypassing decay)
- Plants will consume nitrate
- Water changes will dilute all concentrations (dilution system)

# Task 20: Plants System

**Status:** pending

## Overview

Implement aquatic plants as individual specimens that perform photosynthesis when lights are on, respire 24/7, and compete with algae for resources. Plants consume CO2, light, and nitrate to produce oxygen and grow. Each plant has a size percentage that can exceed 100%, with overgrowth penalties affecting all plants and extreme overgrowth (>200%) releasing waste.

## References

- [6-PLANTS.md](../6-PLANTS.md) - Full plant specification
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Core system architecture, effect tiers
- [5-RESOURCES.md](../5-RESOURCES.md) - Resource definitions
- [8-ACTIONS.md](../8-ACTIONS.md) - Trim Plants action specification

## Scope

### In Scope

- **Plant State Model**:
  - Individual plant specimens with species, size (%), and substrate requirement
  - Species catalog with characteristics (light/CO2 requirements, growth rate, substrate needs)
  - Plants array in simulation state

- **Photosynthesis System** (ACTIVE tier):
  - Only occurs when lights are on
  - Consumes: CO2, light (implicit), nitrate
  - Produces: oxygen, biomass (aggregate pool)
  - Limiting factor (Liebig's Law): actual rate = potential × min(co2_factor, nitrate_factor)
  - Scales with total plant size

- **Biomass Distribution**:
  - Aggregate biomass distributed to individual plants each tick
  - Distribution weighted by species growth rate
  - Increases plant size percentage

- **Respiration System** (ACTIVE tier, runs 24/7):
  - Consumes oxygen, produces CO2
  - Rate scales with total plant size and temperature
  - Day: net O2 production (photosynthesis > respiration)
  - Night: net O2 consumption (respiration only)

- **Size Mechanics**:
  - 0-100%: Normal growth
  - 100-200%: Overgrown - applies penalty to ALL plants' growth
  - >200%: Releases waste (decaying leaves)

- **Algae Competition**:
  - Plants reduce algae growth proportionally to their total size
  - Healthy plants starve algae by consuming shared resources (light, CO2, nitrate)

- **Trim Plants Action**:
  - Reduce all plants to target size (e.g., 50%, 85%, 100%)
  - Only affects plants above target
  - Trimmed material exits system (not converted to waste)

- **UI Components**:
  - Plants panel showing individual plants with size indicators
  - Add/remove plant controls with species selector
  - Trim button in Actions panel with target size selector
  - Substrate compatibility validation when adding plants

### Out of Scope

- **Nutrients resource** - Simplified to nitrate-only model (nitrate serves as plant nitrogen source)
- **Dosing system equipment** - Deferred to separate task
- **Aqua soil nutrient release** - Deferred
- **Individual plant health/death** - Plants don't die, only size changes
- **Plant-specific visual representation** - Generic plant display sufficient
- **Multiple growth stages** - Single continuous size percentage
- **Propagation/splitting** - Manual add only

## Architecture

### State Extensions

Add to `SimulationState`:

```typescript
interface Plant {
  id: string;
  species: PlantSpecies;
  size: number; // percentage, can exceed 100
}

interface SimulationState {
  // ... existing
  plants: Plant[];
}
```

### Species Catalog

```typescript
interface PlantSpeciesData {
  name: string;
  lightRequirement: 'low' | 'medium' | 'high';
  co2Requirement: 'low' | 'medium' | 'high';
  growthRate: number; // relative rate for biomass distribution
  substrateRequirement: 'none' | 'sand' | 'aqua_soil';
}

type PlantSpecies = 'java_fern' | 'anubias' | 'amazon_sword' | 'dwarf_hairgrass' | 'monte_carlo';
```

Example species:
- **Java Fern**: low light, low CO2, slow growth, no substrate (attaches to hardscape)
- **Anubias**: low light, low CO2, slow growth, no substrate
- **Amazon Sword**: medium light, medium CO2, medium growth, sand substrate
- **Dwarf Hairgrass**: high light, high CO2, fast growth, aqua soil
- **Monte Carlo**: high light, high CO2, fast growth, aqua soil

### Photosynthesis System

Create `src/simulation/systems/photosynthesis.ts`:

**Inputs:**
- `resources.light` (must be > 0)
- `resources.co2`
- `resources.nitrate` (mass in mg)
- Total plant size (sum of all plant sizes)

**Outputs:**
- `+oxygen` (mg/L)
- `-co2` (mg/L)
- `-nitrate` (mg)
- `+biomass` (internal, for distribution)

**Formula:**
```typescript
// Only when light > 0
co2_factor = min(1, co2 / OPTIMAL_CO2);  // OPTIMAL_CO2 ~= 20 mg/L
nitrate_factor = min(1, nitrate_ppm / OPTIMAL_NITRATE);  // OPTIMAL_NITRATE ~= 10 ppm

limiting_factor = min(co2_factor, nitrate_factor);
base_rate = BASE_PHOTOSYNTHESIS_RATE * total_plant_size;
actual_rate = base_rate * limiting_factor;

oxygen_produced = actual_rate * O2_PER_PHOTOSYNTHESIS;
co2_consumed = actual_rate * CO2_PER_PHOTOSYNTHESIS;
nitrate_consumed = actual_rate * NITRATE_PER_PHOTOSYNTHESIS;
biomass_produced = actual_rate * BIOMASS_PER_PHOTOSYNTHESIS;
```

### Respiration System

Runs every tick (24/7), produces effects opposite to photosynthesis but at lower rate:

```typescript
respiration_rate = BASE_RESPIRATION_RATE * total_plant_size * temperature_factor;
oxygen_consumed = respiration_rate * O2_PER_RESPIRATION;
co2_produced = respiration_rate * CO2_PER_RESPIRATION;
```

Temperature factor: Q10 = 2 (rate doubles per 10°C increase).

### Biomass Distribution

After photosynthesis calculates aggregate biomass:

```typescript
total_growth_rate = sum(plant.species.growthRate for each plant);
for each plant:
  share = plant.species.growthRate / total_growth_rate;
  size_increase = biomass * share * SIZE_PER_BIOMASS;
  plant.size += size_increase;
```

### Overgrowth Mechanics

```typescript
// Check for any overgrown plants
max_size = max(plant.size for each plant);

if (max_size > 100) {
  // Penalty scales from 0% at 100 to 50% at 200
  overgrowth_penalty = min(0.5, (max_size - 100) / 200);
  // Apply to biomass before distribution
  effective_biomass *= (1 - overgrowth_penalty);
}

// Extreme overgrowth releases waste
for each plant where size > 200:
  excess = plant.size - 200;
  waste_released = excess * WASTE_PER_EXCESS_SIZE;
  // Cap plant at 200 after releasing waste
  plant.size = 200;
```

### Algae Competition

Modify algae growth system to account for plant competition:

```typescript
// In algae system
total_plant_size = sum(plant.size for each plant);
plant_competition_factor = 1 / (1 + total_plant_size / COMPETITION_SCALE);
// COMPETITION_SCALE calibrated so 200% total plant size halves algae growth

algae_growth *= plant_competition_factor;
```

### Trim Plants Action

```typescript
function trimPlants(state: SimulationState, targetSize: number): SimulationState {
  return produce(state, draft => {
    for (const plant of draft.plants) {
      if (plant.size > targetSize) {
        plant.size = targetSize;
      }
    }
    // Log trim action
  });
}

function canTrimPlants(state: SimulationState): boolean {
  return state.plants.some(p => p.size > 50); // Only trim if something to trim
}
```

## Implementation

### 1. State Extensions (`src/simulation/state.ts`)
- Add `Plant` interface with id, species, size
- Add `PlantSpecies` type
- Add `plants: Plant[]` to `SimulationState`
- Add plant species catalog with characteristics

### 2. Config (`src/simulation/config/plants.ts`)
- `BASE_PHOTOSYNTHESIS_RATE` - calibrate for realistic O2 production
- `BASE_RESPIRATION_RATE` - ~10-20% of photosynthesis rate
- `OPTIMAL_CO2` (mg/L for max photosynthesis)
- `OPTIMAL_NITRATE` (ppm for max growth)
- `O2_PER_PHOTOSYNTHESIS`, `CO2_PER_PHOTOSYNTHESIS`
- `NITRATE_PER_PHOTOSYNTHESIS`, `BIOMASS_PER_PHOTOSYNTHESIS`
- `OVERGROWTH_PENALTY_SCALE`, `WASTE_PER_EXCESS_SIZE`
- `COMPETITION_SCALE` (for algae competition)

### 3. Photosynthesis System (`src/simulation/systems/photosynthesis.ts`)
- Check if light > 0
- Calculate limiting factors from CO2 and nitrate
- Apply Liebig's Law (minimum factor)
- Emit effects for O2, CO2, nitrate
- Calculate and return biomass for distribution
- Register as ACTIVE tier system

### 4. Respiration System (`src/simulation/systems/respiration.ts`)
- Calculate temperature-scaled respiration rate
- Emit effects for O2 consumption, CO2 production
- Runs every tick regardless of light
- Register as ACTIVE tier system

### 5. Biomass Distribution (`src/simulation/systems/plant-growth.ts`)
- Receive aggregate biomass from photosynthesis
- Apply overgrowth penalty if any plant > 100%
- Distribute to individual plants by growth rate
- Handle extreme overgrowth (>200%) waste release
- Register as ACTIVE tier system (runs after photosynthesis)

### 6. Update Algae System (`src/simulation/systems/algae.ts`)
- Import plant utilities
- Calculate plant competition factor
- Apply to algae growth rate

### 7. Trim Plants Action (`src/simulation/actions/trim-plants.ts`)
- `trimPlants(state, targetSize)` - reduce plants to target
- `canTrimPlants(state)` - check if any plants can be trimmed
- Export from actions index

### 8. UI - Plants Panel (`src/ui/components/plants/PlantsPanel.tsx`)
- List individual plants with species name and size bar
- Size bar color-coded: green (0-100), yellow (100-200), red (>200)
- Add plant button with species dropdown
- Remove plant button per plant
- Substrate compatibility check (disable incompatible species)

### 9. UI - Actions Panel
- Add "Trim Plants" button
- Target size selector (50%, 85%, 100%)
- Disabled when no plants or all plants below target

## File Structure

```
src/simulation/
  state.ts                          # Add Plant, plants array
  config/
    plants.ts                       # New: Plant constants
  systems/
    photosynthesis.ts               # New: Photosynthesis system
    photosynthesis.test.ts          # New: Tests
    respiration.ts                  # New: Respiration system
    respiration.test.ts             # New: Tests
    plant-growth.ts                 # New: Biomass distribution
    plant-growth.test.ts            # New: Tests
    algae.ts                        # Update: Add plant competition
    index.ts                        # Register new systems
  actions/
    trim-plants.ts                  # New: Trim action
    trim-plants.test.ts             # New: Tests
    index.ts                        # Export trim functions

src/ui/components/
  plants/
    PlantsPanel.tsx                 # Update: Add plant list and controls
  actions/
    ActionsPanel.tsx                # Add Trim button
```

## Acceptance Criteria

### Plant State
- [ ] Plant interface with id, species, size added to state
- [ ] Plants array initialized empty by default
- [ ] Species catalog with 5 species (varied requirements)
- [ ] Species have light/CO2 requirements, growth rate, substrate needs

### Photosynthesis System
- [ ] Only runs when light > 0
- [ ] Consumes CO2 and nitrate
- [ ] Produces oxygen
- [ ] Rate limited by min(CO2 factor, nitrate factor)
- [ ] Scales with total plant size
- [ ] Produces aggregate biomass for distribution

### Respiration System
- [ ] Runs every tick (24/7)
- [ ] Consumes oxygen, produces CO2
- [ ] Rate scales with temperature (Q10 = 2)
- [ ] Rate scales with total plant size

### Size Mechanics
- [ ] Biomass distributed by species growth rate
- [ ] Overgrowth penalty (100-200%) reduces all plants' growth
- [ ] Extreme overgrowth (>200%) releases waste
- [ ] Plants capped at 200% after waste release

### Algae Competition
- [ ] Plant total size reduces algae growth rate
- [ ] Effect scales reasonably (200% plants ~ halves algae growth)

### Trim Plants Action
- [ ] Reduces all plants above target to target size
- [ ] Target options: 50%, 85%, 100%
- [ ] Trimmed material exits system (no waste added)
- [ ] Action logged with amount trimmed

### UI
- [ ] Plants panel shows individual plants with size
- [ ] Add plant with species selector
- [ ] Remove individual plants
- [ ] Substrate compatibility enforced
- [ ] Trim button in Actions panel
- [ ] Target size selector for trim

### Integration
- [ ] Systems registered in ACTIVE tier
- [ ] Net O2 production during day (photosynthesis > respiration)
- [ ] Net O2 consumption at night (respiration only)
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Calibration Notes

**Photosynthesis calibration target:**
- A tank with 100% total plant size, adequate CO2 (20+ mg/L), and nitrate (10+ ppm)
- Should produce ~0.5-1.0 mg/L O2 per hour during lights-on
- Should consume ~5-10 mg nitrate per day

**Respiration calibration target:**
- ~10-20% of max photosynthesis rate
- Noticeable O2 drop at night but not catastrophic
- Well-stocked planted tank shouldn't crash O2 overnight

**Growth calibration target:**
- 100% plant at ideal conditions: ~1-2% size increase per day
- Reaches "needs trimming" (100%) in ~50-100 days from 50%

## Tests

Focus on >90% coverage for:
- Photosynthesis with various CO2/nitrate levels
- Limiting factor selection (Liebig's Law)
- Respiration temperature scaling
- Biomass distribution fairness
- Overgrowth penalty calculation
- Waste release at >200%
- Algae competition effect
- Trim action correctness
- Day/night O2 balance

## Notes

- **Simplified nutrient model**: Using nitrate only instead of separate nutrients resource. Nitrate serves dual purpose as nitrogen cycle end product and plant nutrient.
- **No plant death**: Plants only change size, simplifying the model. User removes unwanted plants manually.
- **Aggregate then distribute**: Photosynthesis calculates total biomass, then distributes. This is simpler than per-plant photosynthesis and creates interesting dynamics (fast-growing species benefit more).
- **Overgrowth is global**: One overgrown plant affects ALL plants, encouraging regular trimming.
- **Competition with algae**: Key gameplay mechanic - healthy plants prevent algae blooms.
- **System order matters**: Photosynthesis → Plant Growth → Respiration → Algae (with competition factor).

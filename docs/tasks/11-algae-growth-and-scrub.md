# Task 11: Algae Growth & Scrub Algae Action

**Status:** pending

## Overview

Implement algae as a biological resource that grows based on light intensity relative to tank size. Light is the primary driver of algae growth - too much light for a given tank size causes rapid blooms. Users can manually scrub algae to remove it, with each scrub removing a random portion. This creates a realistic dynamic where properly sizing lighting prevents algae blooms.

## References

- [5-RESOURCES.md](../5-RESOURCES.md) - Algae resource definition (biological, 0-100 scale)
- [4-CORE-SYSTEMS.md](../4-CORE-SYSTEMS.md) - Core system architecture, effect tiers
- [8-ACTIONS.md](../8-ACTIONS.md) - Scrub Algae action specification
- [9-LOGGING-AND-ALERTS.md](../9-LOGGING-AND-ALERTS.md) - Alert system for high algae levels

## Scope

### In Scope

- **Algae Core System** (PASSIVE tier):
  - Growth based solely on light intensity per liter: `growth = BASE_RATE * (watts / liters)`
  - Simple linear scaling - more light = more algae
  - BASE_RATE = 2.5 (calibrated for ~16/day at 1 W/gal, see algae-calibration.md)
  - Tank size naturally moderates growth (larger tanks need more watts for same growth rate)
  - Algae resource capped at 0-100 (relative scale)
- **Scrub Algae Action**:
  - Manual action to remove algae from tank surfaces
  - Each press removes random amount: 10-30% of current algae level
  - Disabled when algae < 5% (too little to mechanically remove)
  - Removed algae exits system (not converted to waste)
- **UI Components**:
  - Display algae level on Plants panel
  - Green saturation indicator (similar to food on Livestock panel)
  - Scrub button in Actions panel
  - Visual feedback for scrub action effectiveness
- **Alerts**:
  - High algae alert at 80+ level
- **Logging**:
  - Log scrub actions with amount removed
  - Log high algae alert triggers

### Out of Scope

- **Nutrient/nitrate dependencies** - Simplified to light-only growth model
- **Algae-eating colonies** (snails, shrimp) - Deferred to separate livestock/colonies task
- **Plant-based algae inhibition** - Will be added when plants system is implemented
- **Plants panel full implementation** - Only add minimal UI for algae display if panel doesn't exist
- **Multiple algae types** (green, brown, black beard) - Single aggregate algae resource for now
- **Algae growth on specific surfaces** (glass vs hardscape) - Tank-wide algae level only
- **Visual algae overlay on tank** - Numerical indicator sufficient for MVP

## Architecture

### State Extensions

Add algae resource to `Resources` interface:
- `algae: number` (0-100 scale, default 0)

### Algae Growth Core System

Create `src/simulation/core/algae.ts` with:

**Constants:**
- `BASE_GROWTH_RATE = 2.5` (calibrated per-liter rate)
- `ALGAE_CAP = 100`

**Growth Formula:**
```typescript
watts_per_liter = passiveResources.light / tank.capacity
growth_per_hour = BASE_GROWTH_RATE * watts_per_liter
// Capped at 100, emits passive tier effect
```

**Example Growth Rates** (see algae-calibration.md):
- 10 gal (38L) with 10W (1 W/gal): 0.65/hour = ~16/day
- 50 gal (190L) with 50W (1 W/gal): 0.65/hour = ~16/day
- 10 gal (38L) with 40W (4 W/gal): 2.63/hour = ~63/day (bloom!)

**System Registration:**
```typescript
export const AlgaeSystem = {
  id: 'algae',
  tier: 'passive',
  update: updateAlgae,
};
```

## Growth Rate Calibration

The formula `growth = 2.5 * (watts / liters)` produces the following growth rates:

### Small Tank (10 gal / 38L)

| Wattage | W/gal | Growth/hour | Growth/day | Days to 50 | Days to 100 |
|---------|-------|-------------|------------|------------|-------------|
| 5W | 0.5 | 0.33 | 8 | 6 days | 13 days |
| 10W | 1.0 | 0.65 | 16 | 3 days | 6 days |
| 25W | 2.5 | 1.64 | 39 | 1.3 days | 2.5 days |
| 50W | 5.0 | 3.29 | 79 | 15 hours | 30 hours |

### Medium Tank (50 gal / 190L)

| Wattage | W/gal | Growth/hour | Growth/day | Days to 50 | Days to 100 |
|---------|-------|-------------|------------|------------|-------------|
| 10W | 0.2 | 0.13 | 3 | 16 days | 32 days |
| 25W | 0.5 | 0.33 | 8 | 6 days | 13 days |
| 50W | 1.0 | 0.65 | 16 | 3 days | 6 days |
| 100W | 2.0 | 1.33 | 32 | 1.5 days | 3 days |
| 150W | 3.0 | 1.97 | 47 | 1 day | 2 days |

### Large Tank (100 gal / 380L)

| Wattage | W/gal | Growth/hour | Growth/day | Days to 50 | Days to 100 |
|---------|-------|-------------|------------|------------|-------------|
| 25W | 0.25 | 0.16 | 4 | 13 days | 25 days |
| 50W | 0.5 | 0.33 | 8 | 6 days | 13 days |
| 100W | 1.0 | 0.65 | 16 | 3 days | 6 days |
| 150W | 1.5 | 0.99 | 24 | 2 days | 4 days |
| 200W | 2.0 | 1.33 | 32 | 1.5 days | 3 days |

**Key Insights:**
- **W/gal is the key metric** - Same W/gal ratio produces same growth rate regardless of tank size
- **Standard lighting (1 W/gal)** - Reaches visible algae (30-40) in ~2 days, full bloom in ~6 days
- **High light (2+ W/gal)** - Rapid blooms, requires active scrubbing every 1-2 days
- **Low light (< 1 W/gal)** - Slow growth, user has time to establish plants before algae becomes issue

### Realistic Scenarios

**Low Light Setup (0.5 W/gal)**
- 10 gal with 5W, 50 gal with 25W, 100 gal with 50W
- Growth: ~8/day → minimal algae, 6+ days to become noticeable

**Balanced Setup (1 W/gal)**
- 10 gal with 10W, 50 gal with 50W, 100 gal with 100W
- Growth: ~16/day → visible in 2 days, bloom in 6 days

**High Light Planted Tank (2 W/gal)**
- 10 gal with 25W, 50 gal with 100W (typical planted setups)
- Growth: ~32-39/day → rapid blooms without plant competition

**Overpowered (4+ W/gal)**
- 10 gal with 50W (way too much for small tank)
- Growth: ~63-79/day → algae hell, constant scrubbing needed

### Scrub Algae Action

Create `src/simulation/actions/scrub-algae.ts` with:

**Constants:**
- `MIN_SCRUB_PERCENT = 0.10` (10%)
- `MAX_SCRUB_PERCENT = 0.30` (30%)
- `MIN_ALGAE_TO_SCRUB = 5`

**Functions:**
- `scrubAlgae(state)` - Remove random 10-30% of current algae, return new state + log
- `canScrubAlgae(state)` - Check if algae >= 5

**Behavior:**
- Random removal between min/max percent
- Throws error if algae < 5
- Removed algae exits system (not added to waste)
- Logs action with amount removed

## Implementation

### 1. State (`src/simulation/state.ts`)
- Add `algae: number` to `Resources` interface
- Add `algae: 0` to `DEFAULT_RESOURCES`

### 2. Algae Core System (`src/simulation/core/algae.ts`)
- Calculate `watts_per_liter = passiveResources.light / tank.capacity`
- Calculate `growth = BASE_GROWTH_RATE * watts_per_liter`
- Cap growth at 100 maximum
- Emit passive tier effect with delta
- Export `AlgaeSystem` registration object (id, tier, update)
- Register in `src/simulation/core/index.ts`

### 3. Scrub Action (`src/simulation/actions/scrub-algae.ts`)
- Implement `scrubAlgae(state)` - random removal, return state + log
- Implement `canScrubAlgae(state)` - check threshold
- Export from `src/simulation/actions/index.ts`

### 4. Alert (`src/simulation/alerts.ts`)
- Add `high_algae` alert definition (condition: algae >= 80)

### 5. UI - Light Card Wattage Presets
- Update LightCard wattage selector to include low-wattage options
- New preset list: 5W, 10W, 25W, 50W, 100W, 150W, 200W
- Supports small tank / low light configurations

### 6. UI - Actions Panel
- Add "Scrub Algae" button to ActionsPanel
- Enable when `canScrubAlgae(simulation)` is true
- Wire to handler that calls `scrubAlgae()` and logs result

### 7. UI - Plants Panel/Card
- Create minimal Plants panel/card (if doesn't exist)
- Add algae display with green saturation indicator
- Show numeric value (0-100)
- Green intensity scales with level (0-25 light, 75-100 dark bloom)

## File Structure

```
src/simulation/
  state.ts                          # Add algae to Resources
  core/
    algae.ts                        # New: Algae growth system
    algae.test.ts                   # New: Algae system tests
    index.ts                        # Register AlgaeSystem
  actions/
    scrub-algae.ts                  # New: Scrub action
    scrub-algae.test.ts             # New: Scrub action tests
    index.ts                        # Export scrub functions
  alerts.ts                         # Add high_algae alert

src/ui/components/
  equipment/
    LightCard.tsx                   # Update wattage presets (5W, 10W, 25W added)
  actions/
    ActionsPanel.tsx                # Add Scrub button
  plants/
    PlantsPanel.tsx or PlantsCard.tsx  # New: Algae display (minimal for now)
```

## Acceptance Criteria

### Algae Growth System
- [ ] Algae resource added to Resources (0-100 scale, default 0)
- [ ] AlgaeSystem implemented in PASSIVE tier
- [ ] Growth formula: `BASE_GROWTH_RATE * (watts / tank.capacity)`
- [ ] BASE_GROWTH_RATE = 2.5 (per-liter calibration)
- [ ] Growth scales linearly with light intensity
- [ ] Tank size naturally moderates growth rate
- [ ] Algae capped at 100 (cannot exceed)
- [ ] Growth emits effect with tier='passive', resource='algae'
- [ ] Matches calibration table (1 W/gal = ~16/day)

### Scrub Algae Action
- [ ] Scrub action removes random 10-30% of current algae
- [ ] Action disabled when algae < 5
- [ ] Removed algae exits system (not added to waste)
- [ ] Action logs with amount removed and remaining
- [ ] `canScrubAlgae()` correctly checks minimum threshold

### UI
- [ ] LightCard wattage presets updated: 5W, 10W, 25W, 50W, 100W, 150W, 200W
- [ ] Algae displayed on Plants panel (or minimal card if panel doesn't exist)
- [ ] Green saturation indicator showing algae level visually
- [ ] Numeric display shows algae value (0-100)
- [ ] Scrub button in Actions panel
- [ ] Scrub button disabled when algae < 5
- [ ] Visual feedback when scrubbing (algae level decreases)

### Alerts
- [ ] High algae alert triggers at 80+
- [ ] Alert message suggests reducing light or increasing plants

### Logging
- [ ] Scrub actions logged with amount removed
- [ ] Logs include metadata (action, removed, remaining)
- [ ] High algae alerts logged when triggered

### Integration
- [ ] AlgaeSystem registered in CORE_SYSTEMS
- [ ] Algae grows each tick based on conditions
- [ ] Scrub action updates state correctly
- [ ] All tests pass with >90% coverage
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

## Tests

Focus on >90% coverage for:
- Growth formula with various tank sizes and wattages
- Verify growth rates match calibration table
- Growth capping at 100
- Zero growth when light is 0
- Scrub action (random removal range, threshold checks, immutability)
- Integration (multi-tick growth, alerts, action effect)

## Notes

- **Simplified Model**: Light-only growth keeps simulation intuitive - more light = more algae
- **Tank Size Scaling**: Formula naturally accounts for tank size - larger tanks need proportionally more light to grow algae at same rate
- **Watts per Liter**: Key metric is light intensity per volume, not absolute wattage
- **Calibration**: BASE_RATE = 2.5 tuned for realistic growth (~16/day at 1 W/gal typical lighting)
- **Linear Scaling**: No caps or optimal ranges - simple predictable behavior
- **Low Wattage Presets**: Added 5W, 10W, 25W options for small tanks and low-light scenarios
- **Random Scrub Amount**: Adds realism - you can't precisely control mechanical removal, takes multiple scrubs to fully clean
- **5% Minimum Threshold**: Represents that microscopic algae can't be mechanically removed - there's always some base level
- **No Waste Conversion**: Scraped algae is removed from tank, not added to waste stock (matches spec in 8-ACTIONS.md)
- **Future Plant Integration**: Plants will inhibit algae growth (competition for light/nutrients) when implemented
- **Future Colony Integration**: Snails/shrimp will consume algae as part of their metabolism (separate task)
- **Visual Design**: Green saturation indicator matches existing pattern (food on livestock panel) for consistent UI/UX
- **Alert Strategy**: Only alert at 80+ to avoid alert fatigue - moderate algae (30-50) is normal and not alarming
- **Cap at 100**: Prevents unbounded growth, represents maximum visible algae coverage
- **PASSIVE Tier**: Runs after active systems, ready for future plant competition

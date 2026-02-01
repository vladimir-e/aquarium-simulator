# Plants

Aquatic plants that perform photosynthesis and growth, consuming resources and producing oxygen.

## Purpose

Plants in the simulation:
- Consume CO2, light, nutrients, and nitrate
- Produce oxygen through photosynthesis
- Compete with algae for resources
- Provide shelter (reduce fish stress)
- Help maintain water quality

## Plant Model

Plants are modeled as **individual specimens**, each with their own species characteristics and size.

### Key Concepts

1. **Photosynthesis** produces aggregate **biomass** (tank-wide resource)
2. **Biomass** is distributed to individual plants based on their characteristics
3. Each plant has a **size** measured as percentage (%)
4. Plants can grow past 100%, with consequences

---

## Individual Plant Properties

| Property | Description |
|----------|-------------|
| **Species** | Determines characteristics and requirements |
| **Size** | Current size as % (can exceed 100%) |
| **Condition** | Health state 0-100% (affects growth and survival) |
| **Substrate Requirement** | None, Sand, or Aqua Soil |

### Species Characteristics

Each species has different requirements:

| Characteristic | Description |
|----------------|-------------|
| Light Requirement | Low / Medium / High |
| CO2 Requirement | Low / Medium / High |
| Growth Rate | How fast the species grows |
| Substrate Requirement | None / Sand / Aqua Soil |
| Nutrient Demand | Low / Medium / High |

**Nutrient Demand Levels:**
- **Low**: Can survive on nitrate alone (from nitrogen cycle). K, Fe, PO4 boost growth but aren't required. Examples: Java Fern, Anubias
- **Medium**: Needs some supplementation. Struggles without phosphate. Examples: Amazon Sword
- **High**: Requires full nutrient supplementation (all 4 nutrients). Dies without dosing. Examples: Dwarf Hairgrass, Monte Carlo

**Substrate Compatibility:**
- Plants with no substrate requirement: float or attach to hardscape
- Plants requiring Sand: can be planted in Sand or Aqua Soil
- Plants requiring Aqua Soil: can only be planted in Aqua Soil

---

## Photosynthesis

The process of converting light energy, CO2, and nutrients into biomass and oxygen.

### Inputs

| Resource | Role |
|----------|------|
| Light | Energy source (watts) |
| CO2 | Carbon source |
| Nitrate (NO3) | Nitrogen source |
| Phosphate (PO4) | Macronutrient |
| Potassium (K) | Macronutrient |
| Iron (Fe) | Micronutrient |

### Outputs

| Resource | Destination |
|----------|-------------|
| Oxygen | Dissolved O2 in water |
| Biomass | Aggregate pool for plant growth |

### Behavior

Photosynthesis only occurs when light is on (photoperiod).

```
photosynthesis_rate = base_rate * light_factor * co2_factor * nutrient_sufficiency
```

**Nutrient Sufficiency (Liebig's Law):**

Plants check all four nutrients against their demand level. The most limiting nutrient determines overall sufficiency:

```
# Each nutrient checked against species demand
demand_multiplier = { low: 0.3, medium: 0.6, high: 1.0 }
threshold = optimal_ppm * demand_multiplier[species.nutrient_demand]

nitrate_factor = min(1, nitrate_ppm / threshold)
phosphate_factor = min(1, phosphate_ppm / threshold)
potassium_factor = min(1, potassium_ppm / threshold)
iron_factor = min(1, iron_ppm / threshold)

nutrient_sufficiency = min(nitrate_factor, phosphate_factor, potassium_factor, iron_factor)
actual_rate = potential_rate * nutrient_sufficiency
```

**Low-demand plants** need only ~30% of optimal nutrients - achievable with nitrate from fish waste alone.

### Nutrient Consumption

Plants consume nutrients proportionally to the fertilizer formula ratio. This prevents individual nutrients from accumulating while others deplete:

```
# Fertilizer ratio (per ml): NO3:PO4:K:Fe = 5:0.5:2:0.1
# Plants consume in this same ratio
consumption = growth_rate * plant_size
nitrate_consumed = consumption * (5 / total_ratio)
phosphate_consumed = consumption * (0.5 / total_ratio)
potassium_consumed = consumption * (2 / total_ratio)
iron_consumed = consumption * (0.1 / total_ratio)
```

### Oxygen Production

```
oxygen_produced = photosynthesis_rate * total_plant_size * oxygen_per_unit
```

---

## Growth and Size

### Biomass Distribution

After photosynthesis produces aggregate biomass, it's distributed to individual plants:

```
for each plant:
    plant_share = plant.growth_rate / total_growth_rates
    plant_biomass = aggregate_biomass * plant_share
    plant.size += biomass_to_size(plant_biomass, plant.species)
```

### Size Mechanics

| Size Range | Effect |
|------------|--------|
| 0-100% | Normal growth |
| 100-200% | Overgrown - slows growth for ALL plants |
| >200% | Releases waste (decaying leaves) |

**Overgrowth Penalty:**
```
if any_plant.size > 100%:
    overgrowth_factor = calculate_overgrowth_penalty()
    all_plants_growth *= overgrowth_factor
```

**Decay from Extreme Overgrowth:**
```
for each plant where size > 200%:
    excess = plant.size - 200%
    waste_produced = excess * decay_rate
    tank.waste += waste_produced
```

---

## Respiration (24/7)

Plants respire continuously, consuming oxygen and producing CO2.

### Day (Lights On)
- Photosynthesis > Respiration
- Net O2 PRODUCTION
- Net CO2 CONSUMPTION

### Night (Lights Off)
- Only respiration
- Net O2 CONSUMPTION
- Net CO2 PRODUCTION

```
respiration_rate = base_respiration * temperature_factor * total_plant_size

if lights_on:
    O2_change = photosynthesis_O2 - respiration_O2  # positive
    CO2_change = respiration_CO2 - photosynthesis_CO2  # negative
else:
    O2_change = -respiration_O2  # negative
    CO2_change = +respiration_CO2  # positive
```

---

## Plant Condition

Each plant has a **condition** (0-100%) that reflects its overall health, similar to fish health.

### Condition Changes

Condition improves or degrades based on nutrient sufficiency:

| Sufficiency | Condition Effect |
|-------------|------------------|
| ≥ 80% | **Thriving**: Condition improves (+2-5% per tick) |
| 50-79% | **Adequate**: Slight recovery (+0.5-1% per tick) |
| 20-49% | **Struggling**: Slow decline (-0.5-1.5% per tick) |
| < 20% | **Starving**: Rapid decline (-1-3% per tick) |

```
if nutrient_sufficiency >= 0.8:
    condition += RECOVERY_RATE
elif nutrient_sufficiency >= 0.5:
    condition += RECOVERY_RATE * 0.3
elif nutrient_sufficiency >= 0.2:
    condition -= DECAY_RATE * 0.5
else:
    condition -= DECAY_RATE

condition = clamp(condition, 0, 100)
```

### Relaxed Thresholds

The system provides margin for error:
- Missing a single dose doesn't immediately harm plants
- Gradual decline gives user time to notice and correct
- Low-demand plants are very forgiving

---

## Shedding and Death

Plants with low condition begin shedding (losing size) and can eventually die.

### Shedding

When condition drops below 30%, plants begin shedding leaves:

```
if condition < 30:
    shedding_rate = (30 - condition) / 30 * MAX_SHEDDING_RATE
    size_lost = size * shedding_rate
    size -= size_lost

    # Shed material becomes waste
    tank.waste += size_lost * WASTE_PER_SHED
```

- Shedding rate increases as condition drops
- At condition = 0, shedding is at maximum rate
- Shed material adds organic waste to the tank

### Plant Death

A plant dies when:
- **Condition < 10%**, OR
- **Size < 10%**

```
if condition < 10 OR size < 10:
    # Plant dies
    tank.waste += size * WASTE_PER_DEATH
    remove_plant_from_tank()
```

Dead plants add significant waste to the system (decaying biomass).

### Recovery

Plants can recover from low condition if nutrients are restored before death:
- Condition must climb back above 30% to stop shedding
- Size lost to shedding is permanent
- Full recovery to 100% condition takes time

---

## Competition with Algae

Plants and algae compete for the same resources:
- Light
- CO2
- Nitrate (NO3)
- Phosphate (PO4)

Healthy, fast-growing plants out-compete algae by consuming these shared resources first.

```
# Well-grown plants starve algae
if plants_thriving:
    available_nutrients_for_algae = low
    algae_growth_suppressed = true

# Struggling plants = algae opportunity
if excess_nutrients AND poor_plant_health:
    algae_bloom_likely = true
```

**Key dynamic**: Excess nutrients (especially nitrate and phosphate) combined with light promote algae. The natural defense is healthy plants that consume nutrients before algae can use them.

---

## Interactions

### Plants Receive From:
| Resource | Source |
|----------|--------|
| Light | Light equipment (watts) |
| CO2 | CO2 system, fish respiration |
| Nitrate | Nitrogen cycle, fertilizer dosing |
| Phosphate | Decay (trace), fertilizer dosing |
| Potassium | Fertilizer dosing only |
| Iron | Fertilizer dosing only |

### Plants Provide To:
| Resource | Destination |
|----------|-------------|
| Oxygen | Tank dissolved O2 |
| Waste | From overgrowth (>200%), shedding, death |
| Shelter | Reduces fish stress |

---

## Thresholds

| Condition | Effect |
|-----------|--------|
| Light < minimum | Plants decline, algae may thrive |
| CO2 < 10 ppm | Growth severely limited |
| Nitrate = 0 | Nitrogen deficiency, condition drops |
| Phosphate = 0 | Growth limited (medium/high demand plants suffer) |
| K or Fe = 0 | Growth limited (high demand plants suffer) |
| Nutrient sufficiency < 50% | Condition begins declining |
| Nutrient sufficiency < 20% | Rapid condition decline |
| Plant condition < 30% | Shedding begins |
| Plant condition < 10% | Plant dies |
| Plant size < 10% | Plant dies |
| Any plant > 100% | Growth slowed for all plants |
| Any plant > 200% | Releases waste to tank |

---

## Trimming

When plants are trimmed (Action: Trim Plants):

```
# Trim to target size (e.g., 50%, 85%, 100%)
for each plant:
    if plant.size > target:
        trimmed = plant.size - target
        plant.size = target
        # Trimmed material exits system (not added to waste)
```

After trimming:
- Reduced competition among remaining plants
- Growth rate may increase
- Overgrowth penalties removed

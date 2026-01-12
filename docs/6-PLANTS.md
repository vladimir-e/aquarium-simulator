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
| **Substrate Requirement** | None, Sand, or Aqua Soil |

### Species Characteristics

Each species has different requirements:

| Characteristic | Description |
|----------------|-------------|
| Light Requirement | Watts needed for optimal growth |
| CO2 Requirement | Optimal CO2 level |
| Growth Rate | How fast the species grows |
| Substrate Requirement | None / Sand / Aqua Soil |

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
| Nutrients | Fertilizer |
| Nitrate | Nitrogen source |

### Outputs

| Resource | Destination |
|----------|-------------|
| Oxygen | Dissolved O2 in water |
| Biomass | Aggregate pool for plant growth |

### Behavior

Photosynthesis only occurs when light is on (photoperiod).

```
photosynthesis_rate = base_rate * light_factor * co2_factor * nutrient_factor * nitrate_factor
```

**Limiting Factors (Liebig's Law):**
```
limiting_factor = min(light_availability, co2_availability, nutrient_availability, nitrate_availability)
actual_rate = potential_rate * limiting_factor
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

## Competition with Algae

Plants and algae compete for the same resources:
- Light
- CO2
- Nutrients
- Nitrate

Healthy, fast-growing plants out-compete algae by consuming resources first.

```
# Well-grown plants starve algae
if plants_growing_well:
    available_nutrients_for_algae = low

# Struggling plants = algae opportunity
if excess_nutrients:
    algae_bloom_likely = true
```

---

## Interactions

### Plants Receive From:
| Resource | Source |
|----------|--------|
| Light | Light equipment (watts) |
| CO2 | CO2 system, fish respiration |
| Nutrients | Dosing, aqua soil substrate |
| Nitrate | Nitrogen cycle |

### Plants Provide To:
| Resource | Destination |
|----------|-------------|
| Oxygen | Tank dissolved O2 |
| Waste | From overgrowth (>200% size) |
| Shelter | Reduces fish stress |

---

## Thresholds

| Condition | Effect |
|-----------|--------|
| Light < minimum | Plants decline, algae may thrive |
| CO2 < 10 ppm | Growth severely limited |
| Nutrients depleted | Growth stops |
| Nitrate = 0 | Nitrogen deficiency |
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

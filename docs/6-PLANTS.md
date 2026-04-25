# Plants

Aquatic plants that perform photosynthesis and growth, consuming resources and producing oxygen.

> Plant condition runs on the unified vitality engine. See
> `1-DESIGN.md` § The Vitality Engine for the shared math; this doc
> covers plant-specific stressors, benefits, and the surplus-driven
> growth path.

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

After photosynthesis produces aggregate biomass, it's distributed to
individual plants — **but only those with positive surplus** (condition
at 100 and net vitality positive). Stressed plants below 100 condition
take no share of biomass that tick; their photosynthate counts as
maintenance.

```
eligible = plants where surplus > 0
for each plant in eligible:
    plant_share = plant.growth_rate / sum(growth_rates of eligible)
    plant_biomass = aggregate_biomass * plant_share
    plant.size += biomass_to_size(plant_biomass, plant.species)
```

Plants outside `eligible` keep their size unchanged. The biomass
attributable to the photosynthesis they drove is treated as having
been spent on healing or staying alive.

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

## Plant Condition (Vitality)

Each plant has a **condition** (0-100%) driven by the unified
**vitality engine** that fish also use. Each tick, the engine builds
two lists for the plant — damage factors (stressors) and benefit
factors — and produces:

1. The plant's new condition (clamped 0–100), and
2. A **surplus** value when condition is at 100 and benefits exceed
   damage.

The locked design rule: **growth happens only when condition is 100**.
A stressed plant heals first, then grows. It never crawls forward at
reduced rate. Surplus is the gate for biomass distribution
(see *Growth and Size* below).

### Stressor coverage

Each species' tolerance bands (`tolerableLight`, `tolerableCO2`,
`tolerableTemp`, `tolerablePH`) define when a stressor activates:

| Stressor | Trigger | Severity (per unit deviation) |
|----------|---------|-------------------------------|
| Light insufficient | `light < tolerableLight[0]` *and* lights on | `lightInsufficientSeverity` × gap |
| Light excessive | `light > tolerableLight[1]` | `lightExcessiveSeverity` × gap |
| CO2 insufficient | `co2 < tolerableCO2[0]` *and* lights on | `co2InsufficientSeverity` × gap |
| Temperature out of range | outside `tolerableTemp` | `temperatureStressSeverity` × gap |
| pH out of range | outside `tolerablePH` | `phStressSeverity` × gap |
| Nutrient deficiency | Liebig sufficiency < 1 | `nutrientDeficiencySeverity` × (1 − sufficiency) |
| Nutrient toxicity | NO3 ppm > `nutrientToxicityThresholdNitrate` (default 100) | `nutrientToxicitySeverity` × ppm above threshold |
| Algae shading | algae > `algaeShadingThreshold` | `algaeShadingSeverity` × algae above threshold |

CO2 and light-low stressors are gated on `light > 0` (lights on) — at
night the plant is dormant and doesn't suffer from low CO2 or low
light. Light excess remains active any time the lamps are bright
enough to burn leaves.

Damage rates are pre-hardiness; the species `hardiness` (0–1)
multiplier is applied centrally inside the vitality engine (`damage *
(1 - hardiness)`). A high-hardiness species (Anubias 0.75) takes
quarter the damage of a low-hardiness one (Monte Carlo 0.3) under the
same stressor.

### Benefit coverage

Each species also gets a benefit when an environmental factor is
inside its tolerable band. Benefits stack into a positive recovery
rate; in a fully-comfortable tank they sum to roughly 0.5 %/h.

| Benefit | Trigger | Magnitude |
|---------|---------|-----------|
| Light | inside `tolerableLight` | `lightBenefitPeak` |
| CO2 | inside `tolerableCO2` | `co2BenefitPeak` |
| Temperature | inside `tolerableTemp` | `temperatureBenefitPeak` |
| pH | inside `tolerablePH` | `phBenefitPeak` |
| Nutrients | sufficiency × peak | `nutrientBenefitPeak × sufficiency` |

Benefits are **not** scaled by hardiness — a hardy plant tolerates
poor conditions better, but isn't more energised by good ones.

### Vitality math (per tick)

```
damageRate  = Σ stressor.amount × (1 - hardiness)
benefitRate = Σ benefit.amount
net         = benefitRate − damageRate

if net < 0:                      newCondition = condition + net  (clamp ≥ 0)
if net > 0 and condition < 100:  newCondition = min(100, condition + net)
                                 surplus      = 0
if net > 0 and condition == 100: newCondition = 100
                                 surplus      = net
```

Surplus is the per-plant signal that drives biomass distribution.
Once condition crests 100, the plant starts banking surplus and the
growth pipeline routes biomass to it. While condition is below 100,
no surplus → no growth → all photosynthate flows to maintenance.

### Heal-or-decline trajectory

There is no intermediate steady state for plant condition: any organism
whose net rate is non-negative heals to 100, and any organism whose
net rate is negative declines toward 0. A plant whose stressors are
all zero will reach 100 even when its conditions are merely
"adequate" — there is no homeostatic parking. This is the same
trajectory shape used for fish.

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

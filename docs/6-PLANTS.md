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
- Suppress algae (thriving plants stress algae via plant-power; struggling plants stop suppressing it)
- Provide shelter (reduce fish stress)
- Help maintain water quality

## Plant Model

Plants are modeled as **individual specimens**, each with their own species characteristics and size.

### Key Concepts

1. **Photosynthesis** emits resource effects (O2 production, CO2 and
   nutrient uptake). It does NOT directly produce plant size — that
   flows through the surplus supply chain.
2. **Vitality** banks per-plant **surplus** on `Plant.surplus` when
   condition is full and net is positive (saturating at `surplusCap`);
   the same bank drains to buffer damage before condition falls.
3. **Growth** drains the bank each tick, scaled by species growth
   rate and an asymptotic factor against species `maxSize`.
4. Plants can grow past 100% up to their species `maxSize`; growth
   slows asymptotically as size approaches the cap.

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

Growth is **surplus-driven**, per plant, no cross-plant sharing. The
pipeline is:

1. Vitality returns the new `Plant.surplus` bank each tick. Positive
   overflow at full condition accrues into it (up to `surplusCap`);
   negative net drains it before condition falls (see § Plant Condition).
2. Accrual is **photoperiod-gated** (`accrueSurplus: light > 0`): at
   night the overflow is discarded. Plant surplus represents stored
   photosynthate (glucose reserves from carbon fixation); plants need
   active photosynthesis to fix carbon, so without light there's no
   energy actually captured even if vitality's other channels are
   positive. (Vitality itself runs every tick, so plant *condition*
   keeps healing at night from non-light benefits — pH, temperature,
   nutrients — and the reserve still buffers damage overnight; only the
   accrual step pauses.)
3. While the photoperiod is active, growth drains up to
   `plantGrowthPerTickCap` units from the bank. The drained units
   convert to size at:

   ```
   size_gain = drained × asymptoticFactor × speciesGrowthRate × sizePerSurplus
   asymptoticFactor = max(0, 1 − size / species.maxSize)
   ```

   Growth pauses at night for the same biological reason: overnight
   respiration burns sugars for maintenance, but net biomass
   accumulation requires active carbon fixation. The bank doesn't
   drain in the dark.
4. Whatever is left in `Plant.surplus` stays banked. The bank is
   the canonical lifecycle-outcome stock for plants.

The asymptotic factor reduces *spending efficiency*, not withdrawal
amount: a plant near `maxSize` still drains the cap from its bank
each daylight tick, but gets less size for the spend. A plant at its
ceiling stops growing visibly while the bank keeps filling.

Photosynthesis is decoupled from growth: it emits resource effects
only (O2, CO2, nutrient uptake). Plant size never gets photosynthesis
output directly — it only gets surplus, and surplus is gated by
vitality (which is gated by stressors, including the nutrient-
deficiency stressor that photosynthesis health drives upstream). No
double-counting, no parallel mechanism — a single source of truth for
each plant's per-tick growth.

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
2. The new **surplus** bank — fills from overflow at condition 100,
   drains to buffer damage before condition falls (see *Vitality math*).

The locked design rule: **growth happens only when condition is 100**.
A stressed plant heals first, then grows. It never crawls forward at
reduced rate. Surplus is the gate for biomass distribution
(see *Growth and Size* below). The bank also protects condition: a
plant with reserves holds condition through a hostile tick while its
buffer drains, so **condition 100 with negative net means burning
reserves, not thriving** — the plant reads full while its bank bleeds.

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
bank        = clamp(plant.surplus, 0, surplusCap)   // self-heals old saves

if net < 0:                      drain        = min(bank, |net|)
                                 newCondition = max(0, condition − (|net| − drain))
                                 surplus      = bank − drain
if net > 0 and condition < 100:  newCondition = min(100, condition + net)
                                 surplus      = bank            // idle, capped
if net > 0 and condition == 100: newCondition = 100
                                 surplus      = accrue ? min(surplusCap, bank + net) : bank
```

`accrue` is the photoperiod gate (`light > 0`); draining and the cap
clamp apply regardless. While condition is below 100 no overflow banks,
so the bank doesn't fill from healing and growth doesn't happen. Once
condition reaches 100, daylight overflow accrues (up to the cap), the
growth pipeline drains some each daylight tick, and the leftover stays
banked. See *Growth and Size* above for the
full supply chain.

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

## Algae as an organism

Algae is a peer organism to plants and fish: it lives in
`state.algae` and is processed in the ACTIVE tier of the tick.
Unlike plants and fish, **algae has no condition** — it's a pure
population. Stressors and benefits feed a single signed net rate that
drives the surplus reserve bank and, through it, mass: positive net
accrues surplus and grows the bloom; negative net drains the reserve
before mass shrinks, so a stocked bloom rides out a hostile tick.

This shape previews the colony abstraction (snails, shrimps): a
population doesn't need health, just population dynamics.

### State shape

```ts
state.algae: AlgaeState

interface AlgaeState {
  /** Aggregate biomass / coverage 0–100. */
  mass: number
  /** Reserve bank: buffers hostile ticks, spent on mass growth (capped). */
  surplus: number
}
```

Initialised to `{ mass: 0, surplus: 0 }`.

### Plant power — the shared primitive

Both fish vitality (shelter benefit) and algae vitality (suppression
stressor + low_plant_power benefit) read a single tank-wide number:

```
plantPower = Σ over plants of (plant.size / 100) × (plant.condition / 100)
```

A full-grown thriving plant contributes 1.0; a half-grown plant at
full health contributes 0.5; a sick plant contributes 0. Overgrown
plants count proportionally more — a single size-300 healthy plant
contributes 3.

`getPlantPower` lives in `simulation/systems/plant-power.ts` and is
the only place the formula appears.

### Algae stressors

| Stressor | Trigger | Severity (per unit deviation) |
|----------|---------|-------------------------------|
| Plant suppression | `plantPower > suppressionThreshold` | `plantSuppressionSeverity × (plantPower − threshold)` |

There is intentionally no direct CO2 / temperature / pH / oxygen
stressor on algae. Plant condition is the **meta-signal** — anything
that hurts plants (low CO2, bad pH, ammonia spike) shows up to algae
as falling plant power, which shifts algae from suppressed → fueled.

### Algae benefits

Capped at peak: `min(peak, severity × deviation)`.

| Benefit | Trigger | Magnitude |
|---------|---------|-----------|
| Excess light | `light > lightExcessThreshold` (W/L) | `min(peak, severity × (wpl − threshold))` |
| Excess nutrients | NO3 ppm or PO4 ppm above plant optimum | `min(peak, severity × max(no3Excess, po4Excess))` |
| Nutrient deficiency | NO3 ppm or PO4 ppm below plant optimum | `min(peak, severity × max(no3Def, po4Def))` (small) |
| Low plant power | `plantPower < weaknessThreshold` | `min(peak, severity × (threshold − power))` |

`low_plant_power` and `plant_suppression` are mirror-image factors
with a deadband between `weaknessThreshold` and `suppressionThreshold`
— neither fires inside the band, giving the system a quiet zone.
`excess_nutrients` is the dominant nutrient lever; `nutrient_deficiency`
is the canary signalling "plants are starving, algae moves in" with
intentionally small severity.

### Net rate

Each tick, `computeAlgaePopulation` builds the stressor / benefit
factor lists and reduces them to a signed net:

```
damageRate  = Σ stressor.amount × (1 − hardiness)
benefitRate = Σ benefit.amount
net         = benefitRate − damageRate
```

Hardiness is clamped to `[0, 1]` and scales stressors only. The
factor lists are returned alongside the net rate as a `breakdown`
for UI / telemetry — same shape the plant and fish vitality
engines emit.

### Mass dynamics

The bloom folds `net` into the surplus reserve bank via the shared
`bankSurplus` primitive (the same one fish and plants use), then spends
what's left on mass:

```
bank = clamp(algae.surplus, 0, surplusCap)   // self-heals old saves
if net > 0 and lights on:  bank = min(surplusCap, bank + net)  // accrue
if net < 0:                drain = min(bank, |net|); bank −= drain
                           overflow = |net| − drain             // hits mass
```

**Positive net → surplus → mass growth.** Accrual and growth-spend are
photoperiod-gated (lights on). The tick-spend step drains the bank into
mass with the same asymptotic shape as plant growth:

```
drained      = min(bank, algaeGrowthPerTickCap)
factor       = max(0, 1 − mass / 100)
massIncrease = drained × factor × massPerSurplus
```

The asymptotic factor self-limits at `mass = 100`: surplus keeps
draining at full rate but yields less mass per unit drawn near
saturation.

**Negative net → drain reserve, then shrink mass.** Runs 24/7 (a
suppressed bloom recedes at night too). The reserve absorbs the hit
first; only the shortfall the bank can't cover reduces mass:

```
algae.mass = max(0, algae.mass − overflow)   // overflow = damage past the bank
```

Decayed mass is **lost from the system** — not converted to waste
or nutrients. Same convention as scrubbing.

**Spec invariant**: while `net ≥ 0` and lights are on, mass is
monotonically non-decreasing apart from scrub. The only ways to
remove healthy algae mass are scrubbing (manual) or driving net
negative *for longer than the reserve can absorb* (heavy planting /
rebalanced nutrients / light reduction).

### Tick ordering

Algae runs in the ACTIVE tier, **after plants**, before livestock.
That order matters: algae stressors / benefits read freshly-updated
plant condition through `getPlantPower`. The reverse direction — algae
mass affecting plants via the plant-side `algae_shading` stressor —
is allowed to lag by one tick (algae mass from the previous tick
feeds this tick's plant vitality), an acceptable trade-off for the
ordering required by the suppression feedback loop.

### Algae shading on plants

The plant-side `algae_shading` stressor reads `state.algae.mass` and
fires once mass crosses `algaeShadingThreshold` (default 30). Above
the threshold:

```
algaeShadingDamage = algaeShadingSeverity × (mass − threshold)
```

This is the feedback loop that makes the threshold meaningful: a
mild bloom self-limits via plant suppression, but a heavy bloom
hammers plants into decline, which lifts algae's `plant_suppression`
stressor, which lets algae grow more — the death spiral. Manual
scrubbing is the player's only out once it spirals.

### Configuration

All algae knobs live in `simulation/config/algae-vitality.ts`:
hardiness, the suppression / weakness thresholds, severities and
peaks for each benefit channel, and the surplus-spend shape.
First-pass values aim for **mechanism correctness**, not ecological
accuracy — a recalibration session follows Task 42 and will tune
these against the calibration scenarios.

### Out of scope (deferred)

- Nutrient consumption by algae (algae doesn't draw NO3 / PO4 from
  the pool). If it did, `excess_nutrients` would self-limit
  organically. Adds calibration surface — defer.
- Algae as a fish stressor (covers gills, etc.). Real concern, but
  decline path can wait.
- Multiple algae species (BBA / GSA / hair). Single aggregate is
  fine for now; the new state shape is extensible.
- Mass-decay → waste conversion. Decayed algae just disappears.
- Generic colony / mass-based-organism abstraction. This task makes
  algae the first instance; refactor when a second instance lands
  (snail / shrimp colony).

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
    plantPower_high → algae_plant_suppression_active
    algae_net_negative → mass_shrinks_directly

# Struggling plants = algae opportunity
if excess_nutrients AND poor_plant_health:
    plantPower_low → algae_low_plant_power_benefit
    excess_nutrients_benefit → algae_net_positive → surplus_grows_mass
```

**Key dynamic**: Excess nutrients (especially nitrate and phosphate) combined with light promote algae. The natural defense is healthy plants whose plant-power drives algae's net rate negative — a thriving canopy stops the bloom from banking surplus and shrinks existing mass directly until lights-out or scrub.

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

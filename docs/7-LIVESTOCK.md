# Livestock

Animals living in the aquarium: fish (individuals) and colonies (snails, shrimp as populations).

> Fish health runs on the unified vitality engine. See `1-DESIGN.md`
> § The Vitality Engine for the shared math and § The Surplus Economy
> for the breeding/growth gating story; this doc covers fish-specific
> stressors, benefits, and lifecycle mechanics.

## Purpose

Livestock in the simulation:
- Consume food and oxygen
- Produce waste and CO2
- Have health affected by stressors
- Can reproduce
- Participate in predation dynamics (shrimp only)

## Entity Models

### Individual Organisms (Fish)

Each fish is tracked individually with:

| Property | Description |
|----------|-------------|
| Species | Determines characteristics and requirements |
| Mass | Body mass (grams) - drives metabolism |
| Health | 0-100%, fish dies at 0 |
| Age | Time since birth |
| Satiation | 0-100% (0 = starving, 100 = stuffed) |
| Sex | Male / Female (for reproduction) |

### Species Characteristics

| Characteristic | Description |
|----------------|-------------|
| Adult Mass | Mass when fully grown |
| Max Age | Species lifespan |
| Environment Requirements | Temperature, pH ranges |
| Hardiness | Tolerance to stressors (hardy fish = wider ranges) |

### Population-Based Colonies

Snails and shrimps are modeled as single aggregate organisms:
- Population count
- Collective resource consumption
- Simplified reproduction

---

## Feeding Priority

Food distribution follows a strict priority order:

### Priority 1: Fish
```
available_food = tank.food
for each fish (sorted by satiation, lowest first — hungriest served first):
    emptiness  = (100 − fish.satiation) / 100
    food_needed = emptiness * fish.mass * metabolism_rate
    food_given  = min(food_needed, available_food)
    fish.consume(food_given)             # raises satiation toward 100
    available_food -= food_given
```

A fish keeps eating until satiation hits the 100 cap — there is no
voluntary stop at "full enough." Overfeeding is reachable through
the normal eating loop and is punished by the satiation-band stressor
(see § Health (Vitality) → Satiation channel).

### Priority 2: Colonies (equal split)
```
leftover_food = available_food
food_per_colony = leftover_food / 2  # equal split

snails.consume(food_per_colony)
shrimp.consume(food_per_colony)
```

### Algae Distribution (equal)
```
available_algae = tank.algae
algae_per_colony = available_algae / 2

snails.consume_algae(algae_per_colony)
shrimp.consume_algae(algae_per_colony)
```

---

## Metabolism

The process of converting food and oxygen into energy, waste, and CO2.

### Mass-Based Calculations

Fish mass drives all metabolism numbers:

```
food_needed = base_food_rate * fish.mass
oxygen_consumed = base_respiration * fish.mass
waste_produced = food_consumed * waste_ratio
co2_produced = oxygen_consumed * respiratory_quotient
```

### Waste Production

Fish directly produce waste (added to tank waste stock):
```
tank.waste += fish.waste_produced
```

This is separate from the Decay system - fish metabolism adds waste directly.

---

## Health (Vitality)

Fish health is driven by the unified **vitality engine** (shared with
plants — see `docs/6-PLANTS.md` § Plant Condition for the full
spec). Each tick the engine builds two factor lists for the fish:

1. **Stressors** — damage rates from out-of-range factors
2. **Benefits** — recovery rates from in-range factors

…and produces:

- **newCondition** — the new health value (0–100, clamped)
- **surplus** — the overflow rate when health is at 100 and net is
  positive. Banked on `fish.surplus`; the bank is the canonical
  lifecycle-outcome stock for fish.

### Stressor coverage

| Stressor | Safe Range | Severity (per unit deviation) |
|----------|------------|-------------------------------|
| Temperature | Species-specific | `temperatureStressSeverity` × gap |
| pH | Species-specific | `phStressSeverity` × gap |
| Ammonia (free NH3) | 0 ppm | `ammoniaStressSeverity` × free NH3 ppm |
| Nitrite | 0 ppm | `nitriteStressSeverity` × ppm |
| Nitrate | < 40 ppm | `nitrateStressSeverity` × ppm above 40 |
| Satiation (overfed) | satiation < 90 | ramp from 0 at 90 to `satiationOverfedSeverity` at 100 |
| Satiation (hungry) | satiation > 50 | ramp from 0 at 50 to `satiationHungrySeverity` at 25 |
| Satiation (starving) | satiation > 25 | ramp from `satiationHungrySeverity` at 25 to `satiationStarvingSeverity` at 0 (steeper) |
| Oxygen | > 5 mg/L | `oxygenStressSeverity` × mg/L below 5 |
| Water level | > 50% capacity | `waterLevelStressSeverity` × % below 50 |
| Flow | Species-specific | `flowStressSeverity` × LPH above max |
| Age | ≤ species `maxAge` | `ageStressSeverity` × hours past `maxAge` |

Severities are pre-hardiness. The fish's effective hardiness
(species baseline + per-individual offset, clamped 0.1–0.95) is
applied centrally: `damage = severity × gap × (1 − hardiness)`.

### Benefit coverage

Four benefits boost recovery when their condition is in range. The
abiotic three sum to ≈1.0 %/h when the tank is in good shape; the
biotic plant-presence benefit adds up to 0.2 %/h on top of that:

| Benefit | Trigger | Magnitude |
|---------|---------|-----------|
| pH | inside species pH range | 0.4 %/h |
| Well fed | satiation 75–99 (well-fed band), peak at 87 | up to 0.3 %/h |
| Oxygen | O2 ≥ 5 mg/L | 0.3 %/h |
| Plants | live plants in the tank | up to 0.2 %/h |

Temperature is **not** a separate fish benefit — within the species
range there's already zero temp damage and the other benefits cover
recovery. Outside the range the temperature stressor takes over.
Adding a tighter `optimalTemperature` sub-band (with a small
in-optimal benefit) is straightforward when calibration data
warrants it.

The plant benefit sums `(size/100) × (condition/100)` across every
plant in the tank and runs the total through a linear-ramp saturation
`min(1, total / 3.0)` — so three full-grown healthy plants of biomass
saturate the benefit at its 0.2 %/h peak and adding more plants
beyond that doesn't keep boosting fish vitality. Plants count by raw
biomass, so a single overgrown plant can saturate the benefit on its
own; that's intended — overgrowth is regulated on the plant side
(self-shading and interspecies competition push an overgrown plant
toward stressed → biomass dies back → contribution shrinks), so the
fish-side math stays linear in raw biomass. Sick plants (condition 0)
and juveniles (small size) contribute proportionally less. The plant
benefit pushes the total budget in a fully planted tank to ≈1.2 %/h:
a healthy planted tank sits at full health with a positive net rate,
accumulating surplus on `Fish.surplus`. The bank is the canonical
lifecycle-outcome stock for fish — `Fish.surplus` only fills when the
environment is stocked *and* maintained well enough to bank a
sustained positive net rate.

### Vitality math (per tick)

```
damageRate  = Σ stressor.amount × (1 - effectiveHardiness)
benefitRate = Σ benefit.amount
net         = benefitRate − damageRate

if net < 0:                     newHealth = health + net   (clamp ≥ 0)
if net > 0 and health < 100:    newHealth = min(100, health + net)
                                surplus   = 0
if net > 0 and health == 100:   newHealth = 100
                                surplus   = net   (banked on fish.surplus)
```

Stressed fish heal first, never gain surplus while health is below
100 — this mirrors the plant rule. Surplus banks on `Fish.surplus`,
the canonical lifecycle-outcome stock for fish.

### Satiation channel — five bands

Satiation sits on both sides of the vitality ledger via a single
piecewise-linear contribution function (`systems/satiation.ts`).
Anchor points map to five UI bands:

| Satiation | Band      | Vitality contribution |
|-----------|-----------|-----------------------|
| 100 → 99  | Overfed   | stressor (peak `satiationOverfedSeverity` at 100; 1%-wide sliver) |
| 99  → 75  | Well fed  | benefit (peak `satiationWellFedPeak` at the midpoint 87) |
| 75  → 50  | Peckish   | neutral — no contribution |
| 50  → 25  | Hungry    | stressor (ramp 0 → `satiationHungrySeverity` at 25) |
| 25  →  0  | Starving  | stressor (ramp `satiationHungrySeverity` → `satiationStarvingSeverity` at 0; steeper slope) |

Bands exist as **UI labels only** — internally the contribution is
one continuous function with linear ramps between anchors. It crosses
zero smoothly at every band boundary (99, 75, 50). At satiation 25
the curve doesn't cross zero — it joins continuously through the
hungry severity onto a steeper slope into the starving band.

The narrow overfed band is intentional: under steady-state eating
the per-tick equilibrium sits at sat ≈ 99.4 (100 − 0.6 %/hr decay),
which lands near the edge of overfed and contributes only ~0.4× peak
severity — a healthy fish topped up by the player's normal feeding
cadence drops cleanly into well-fed once the food drains. Sustained
overfeeding (player keeps refilling the food before decay can act)
pins satiation at 100, which is where the overfed cost actually bites.

A fasting fish therefore loses the well-fed benefit as soon as
satiation drops below 75, sits neutral through the peckish band, and
then takes accelerating damage from satiation 50 down. By the bottom
of the starving band the per-tick loss is steep enough that ~24 hr
of starving conditions starts threatening survival even in otherwise
clean water. An overfed fish (player keeps dumping food, satiation
pinned at 100) takes a steady drift of ~0.3 %/h net loss in
otherwise-ideal conditions — slow drift, not a cliff.

### Hardy Fish

Species with high hardiness have:
- More resistance to all stressors (the (1 − hardiness) multiplier
  is universal — it's not per-stressor)
- Per-individual offset (±15 % of baseline) randomised at `addFish`
  time so weaker individuals fail first

Benefits are **not** scaled by hardiness — a hardy fish tolerates
poor conditions, but isn't more energised by good ones.

---

## Death Mechanics

Death is vitality-driven: when health reaches 0, the fish dies. There
is no separate probabilistic check.

Old age flows through the same channel: past species `maxAge` the
**Age** stressor activates and accumulates damage that scales with
hours past, runs through the species' hardiness, and eventually drives
condition to zero. A hardy species in good conditions outlives a
sensitive species at the same age, and visible declining health gives
the player a chance to react. When the death is logged, age-driven
deaths are flagged "(old age)" so the cause is legible.

### When Fish Dies
```
tank.waste += fish.mass * decay_factor
fish.remove_from_tank()
```

---

## Reproduction

Fish breeding mechanics.

### Requirements

| Condition | Description |
|-----------|-------------|
| Male + Female | Both sexes present |
| Good health | Health > 70% |
| Adequate food | Satiation in the well-fed band (≥ 75) |
| Proper conditions | Temperature, pH in range |

### Fry Lifecycle

1. **Spawn**: Fry created with minimal mass
2. **Growth**: Fry consume extra food, increase mass
3. **Maturity**: When age > maturity_age, convert to adult
4. **Adult**: Mass becomes static (no more growth)

```
if fry.age > maturity_age:
    fry.mass = species.adult_mass  # Final mass
    convert_to_adult(fry)
    # Mass is now STATIC - no further growth
```

---

## Predation

Larger fish eating smaller organisms.

### Predation Rules

| Predator | Can Eat | Cannot Eat |
|----------|---------|------------|
| Fish | Shrimp | Snails (protected) |
| Fish | Fry | - |
| Large fish | Small fish | - |

**Snails have shell protection** - fish cannot eat them.

### Behavior

```
if predator.satiation < threshold:        # hungry enough to hunt
    if shrimp_available:                  # Only shrimp, not snails
        predator.consume(shrimp)
        shrimp.population -= predation_count
        predator.satiation += nutritional_value
```

### Protection Factors
- Hiding spots (plants, hardscape) reduce predation
- Well-fed predators hunt less

---

## Colonies

Snails and shrimps modeled as single aggregate organisms.

### Properties

| Property | Description |
|----------|-------------|
| Population | Number of individuals |
| Per-capita consumption | Food/algae per individual |
| Growth rate | Reproduction rate |

### Food Sources

| Colony | Primary Food | Secondary Food |
|--------|--------------|----------------|
| Snails | Algae | Food leftovers |
| Shrimp | Algae | Food leftovers |

Both colonies receive equal shares of algae and food leftovers.

### Colony Equilibrium

Colonies self-balance based on food availability:

**When food is scarce:**
```
if food_available < population * min_food_need:
    starvation_rate = (shortfall / population)
    population -= starvation_rate
    # Smaller population = less consumption = equilibrium
```

**When food is abundant:**
```
if food_available > population * satiation_threshold:
    reproduction_rate = excess_food_factor
    population += reproduction_rate * population
    # Can grow indefinitely if overfed!
```

### Overpopulation Dynamics

Colonies can explode if consistently overfed, but:
- Large populations increase stressors (waste, oxygen depletion)
- Eventually stressors cause die-off
- System finds new equilibrium

```
if population > healthy_population_limit:
    stress_from_crowding += overpopulation_stress
    # High stress eventually causes death rate > birth rate
```

---

## Livestock Summary

### Fish (Individual)

```
Fish {
    species: String
    mass: Number (grams, static after maturity)
    sex: Male | Female
    age: Number
    health: 0-100             // condition in vitality terms
    satiation: 0-100          // 0 = starving, 100 = stuffed
    hardinessOffset: Number   // ±15 % of species baseline
    surplus: Number           // banked vitality overflow

    update(tick):
        metabolize(based_on_mass)
        produce_waste()
        compute_vitality(stressors, benefits, hardiness, health)
            → newHealth, surplus
        accumulate_surplus(fish.surplus)
        check_reproduction()
        check_death(health_or_old_age)
}
```

### Colony (Population)

```
Colony {
    species: "snails" | "shrimp"
    population: Number

    update(tick):
        receive_food(leftovers / 2)
        consume_algae(available / 2)
        produce_waste()
        adjust_population(food_availability)
        check_predation()  # shrimp only
}
```

---

## Interactions

### Livestock Receives From:
| Resource | Source | Priority |
|----------|--------|----------|
| Food | Feeding action, auto feeder | Fish first, then colonies |
| Algae | Tank algae stock | Equal split to colonies |
| Oxygen | Gas exchange, plants | All livestock |

### Livestock Provides To:
| Resource | Destination |
|----------|-------------|
| Waste | Tank waste stock (direct) |
| CO2 | Dissolved in water |

---

## Thresholds

| Parameter | Safe | Warning | Critical |
|-----------|------|---------|----------|
| Health | > 70% | 30-70% | < 30% |
| Satiation | 75-99 (well-fed) | 50-75 (peckish) or 99-100 (overfed sliver) | < 50 (hungry) or 100 sustained (overfed drift) |
| Temperature (tropical) | 24-28°C | 22-24°C or 28-30°C | < 20°C or > 32°C |
| pH (most fish) | 6.5-7.5 | 6.0-6.5 or 7.5-8.0 | < 5.5 or > 8.5 |
| Ammonia | 0 | 0.01-0.02 ppm | > 0.05 ppm |
| Oxygen | > 6 mg/L | 4-6 mg/L | < 4 mg/L |

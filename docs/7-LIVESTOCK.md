# Livestock

Animals living in the aquarium: fish (individuals) and colonies (snails, shrimp as populations).

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
| Hunger | 0-100% |
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
for each fish (sorted by hunger, highest first):
    food_needed = fish.hunger * fish.mass * metabolism_rate
    food_given = min(food_needed, available_food)
    fish.consume(food_given)
    available_food -= food_given
```

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

## Health

Fish health is affected by environmental stressors.

### Stressors

| Stressor | Safe Range | Effect |
|----------|------------|--------|
| Temperature | Species-specific | Outside range damages health |
| pH | Species-specific | Outside range damages health |
| Ammonia | 0 ppm | Any ammonia damages health |
| Nitrite | 0 ppm | Any nitrite damages health |
| Nitrate | < 40 ppm | High nitrate damages health |
| Hunger | < 50% | High hunger damages health |
| Oxygen | > 5 mg/L | Low oxygen damages health |
| Water level | > minimum | Low water stresses fish |
| Flow | Species-specific | Excessive flow stresses some fish |

### Hardy Fish

Species with high hardiness have:
- Wider temperature tolerance ranges
- Wider pH tolerance ranges
- More resistance to ammonia/nitrite spikes
- Slower health degradation from stressors

```
health_damage = base_damage * (1 - hardiness_factor)
```

### Health Calculation

```
stress_total = 0
for each stressor:
    if outside_safe_range:
        stress_total += severity * (deviation from safe range) * (1 - hardiness)

health_change = base_recovery - stress_total
health = clamp(health + health_change, 0, 100)

if health <= 0:
    fish_dies()
```

---

## Death Mechanics

### From Health (Deterministic)
When health reaches 0, fish dies immediately.

### From Old Age (Non-Deterministic)
When fish reaches max age:
- Fish becomes **susceptible to death**
- Each tick: **1% chance of death**
- Prevents synchronous die-off of same-age fish

```
if fish.age >= fish.max_age:
    if random() < 0.01:  # 1% per tick
        fish_dies()
```

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
| Adequate food | Hunger < 30% |
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
if predator.hunger > threshold:
    if shrimp_available:  # Only shrimp, not snails
        predator.consume(shrimp)
        shrimp.population -= predation_count
        predator.hunger -= nutritional_value
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
    health: 0-100
    hunger: 0-100

    update(tick):
        metabolize(based_on_mass)
        produce_waste()
        apply_stressors(modified_by_hardiness)
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
| Hunger | < 30% | 30-70% | > 70% |
| Temperature (tropical) | 24-28°C | 22-24°C or 28-30°C | < 20°C or > 32°C |
| pH (most fish) | 6.5-7.5 | 6.0-6.5 or 7.5-8.0 | < 5.5 or > 8.5 |
| Ammonia | 0 | 0.01-0.02 ppm | > 0.05 ppm |
| Oxygen | > 6 mg/L | 4-6 mg/L | < 4 mg/L |

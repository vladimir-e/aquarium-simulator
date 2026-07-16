# Actions

User interventions that modify the aquarium state. Actions are triggered by the user and applied immediately (outside the tick loop).

## Purpose

Actions allow the user to:
- Maintain the aquarium (feeding, cleaning, water changes)
- Respond to problems (algae scrubbing, emergency water change)
- Manage livestock (stocking fish, selling fry)
- Request professional help (maintenance service)

---

## Feed

Add food to the tank for fish consumption.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Amount | Quantity of food to add |

### Effects
| Resource | Change |
|----------|--------|
| Food | +amount |

### Behavior

```
tank.food += feed_amount
# Fish will consume food during metabolism
# Uneaten food decays into waste
```

### Considerations
- Overfeeding causes ammonia spikes
- Underfeeding increases hunger stress
- Recommended: small amounts 1-2x daily

---

## Clean Substrate

Vacuum the substrate to remove accumulated waste.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Intensity | How thoroughly to clean (0-100%) |

### Effects
| Resource | Change |
|----------|--------|
| Waste | -amount (based on intensity) |

### Behavior

```
waste_removed = tank.waste * intensity * substrate_waste_fraction
tank.waste -= waste_removed
```

### Considerations
- Removes detritus trapped in substrate
- Deep cleaning may disturb plants
- Also removes some beneficial bacteria from substrate surface
- **Sand cannot be vacuumed** (too fine) - only works with Gravel or Aqua Soil

---

## Top Off

Add fresh water to replace evaporated water.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Amount | Liters to add |

### Effects
| Resource | Change |
|----------|--------|
| Water | +amount |
| All concentrations | Diluted |

### Behavior

```
old_volume = tank.water
tank.water += amount
new_volume = tank.water

# Dilute all dissolved substances
for each dissolved_resource:
    resource.concentration *= (old_volume / new_volume)

# Add tap water pH influence
tank.pH = weighted_average(tank.pH, tap_water_pH, old_volume, amount)
```

### Considerations
- Top-off water should be dechlorinated
- Only replaces evaporated water (doesn't remove pollutants)
- ATO does this automatically

---

## Change Water

Remove old water and replace with fresh water, restoring tank to full capacity.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Percentage | Fraction of current water to remove (10%, 25%, 50%, 90%) |

### Effects
| Resource | Change |
|----------|--------|
| Water | Restored to 100% capacity |
| Nitrogen compounds | Reduced by percentage (ammonia, nitrite, nitrate) |
| Temperature | Blends toward tap water temperature |
| pH | Moves toward tap water pH |

### Behavior

```
water_removed = tank.water * percentage
remaining_water = tank.water - water_removed
water_added = tank.capacity - remaining_water  # Fill to 100%

# Remove water WITH dissolved substances
for each dissolved_resource:
    resource.amount *= (1 - percentage)

# Temperature blending (heat capacity weighted average)
tank.temperature = (tank.temperature * remaining_water + tap_temperature * water_added) / tank.capacity

# Add new water to capacity
tank.water = tank.capacity
tank.pH = blend(tank.pH, tap_water_pH, remaining_water, water_added)
```

### Considerations
- Primary method of nitrate removal
- Large changes (> 50%) can stress fish
- Cold tap water causes temperature drop - heater will need to recover
- Dechlorinate new water
- If tank is below 100%, water change also acts as a top-off

### Stressor Effect

```
if percentage > 0.3:  # > 30% water change
    for each fish:
        fish.apply_stress(water_change_stress * percentage)
```

---

## Dose

Add all-in-one fertilizer to the tank.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Amount | Milliliters of fertilizer to add |

### Effects
| Resource | Change |
|----------|--------|
| Nitrate (NO3) | +5.0 mg per ml |
| Phosphate (PO4) | +0.5 mg per ml |
| Potassium (K) | +2.0 mg per ml |
| Iron (Fe) | +0.1 mg per ml |

### Behavior

```
tank.nitrate += amount * 5.0
tank.phosphate += amount * 0.5
tank.potassium += amount * 2.0
tank.iron += amount * 0.1
```

### Fertilizer Formula

The all-in-one fertilizer provides balanced nutrition. Plants consume nutrients in this same ratio, preventing imbalances from building up over time.

### Considerations
- Typical dose: 1-5 ml depending on tank size and plant load
- Daily or every-other-day dosing for planted tanks
- Overdosing promotes algae (but relaxed threshold gives margin for error)
- Low-demand plants may not need dosing at all
- Dosing System equipment automates this action

---

## Scrub Algae

Manually remove algae from glass and surfaces.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Intensity | How thoroughly to scrub (0-100%) |

### Effects
| Resource | Change |
|----------|--------|
| Algae | -amount (based on intensity) |

### Behavior

```
algae_removed = tank.algae * intensity
tank.algae -= algae_removed
# Removed algae exits system (scraped off, not converted to waste)
```

### Considerations
- Regular scrubbing prevents buildup
- Doesn't address root cause (excess light/nutrients)
- Some algae types harder to remove

---

## Trim Plants

Cut back overgrown plant mass.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Amount | Biomass to remove |

### Effects
| Resource | Change |
|----------|--------|
| Plant biomass | -amount |

### Behavior

```
tank.plant_biomass -= trim_amount
# Trimmed plants exit system (removed from tank)
# NOT converted to waste
```

### Considerations
- Prevents overcrowding
- Stimulates new growth in remaining plants
- Removed material can be sold/discarded

---

## Add Fish

Stock one adult fish of a chosen species. Individual variation (sex,
hardiness offset, health jitter) is sampled at add time; see
`7-LIVESTOCK.md`.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Species | Which species to stock |

### Physical stocking cap

`addFish` enforces a **plausibility** ceiling, not a husbandry one.
Overstocking is a legitimate (and punished) player choice — cramming a
nano tank far past its sane bioload is physically possible, so it's
allowed, and the vitality engine plays out the consequences (ammonia,
oxygen crash, waste). The cap only blocks the physically *impossible*: a
tank that would hold more solid fish than water.

Fish are near-neutrally buoyant (the swim bladder trims body density to
roughly that of water), so **1 g of fish ≈ 1 mL of displaced water**. The
ceiling caps total fish body mass at the fraction `MAX_FISH_VOLUME_FRACTION`
(default **0.5**) of the tank's water volume:

```
maxFishMass_g = MAX_FISH_VOLUME_FRACTION * capacity_L * 1000   # 500 g per liter
reject addFish if (totalFishMass + species.adultMass) > maxFishMass
```

At 0.5 the fish would fill half the water volume — already absurd for
living animals — so any realistic overstocking sits far below it while a
nonsense request (a thousand fish in a nano cube) is rejected. The check
mirrors the plant capacity check: a rejected add returns an explanatory
message and no state change.

**The cap applies only to `addFish`.** Breeding and hatching are
deliberately uncapped — ecology self-regulates, and bred fry can push the
total past the ceiling (which then just refuses further stocking until the
population drops). See `7-LIVESTOCK.md` § Reproduction.

### Considerations
- `MAX_FISH_VOLUME_FRACTION` is a tunable constant in `fish-management.ts`
- Measured against tank **capacity**, not current water level, so the
  ceiling doesn't wobble as water evaporates
- Total mass includes fry, so a tank full of bred fry can refuse a
  stocked adult

---

## Sell Fry

Remove every fry from the tank in one action — the population-management
pressure valve for a tank that has bred past what the player wants to keep.
Fry are ordinary fish carrying `stage: 'fry'`; this action drops all of them
and leaves adults untouched.

### Effects
| Resource | Change |
|----------|--------|
| Fry (`stage === 'fry'`) | All removed |
| Adults | Unchanged |
| Water | Unchanged |

### Behavior

```
fry = state.fish.filter(f => f.stage === 'fry')
if fry.length == 0:
    return "No fry to sell"          # no-op

state.fish = state.fish.filter(f => f.stage !== 'fry')   # drop every fry, keep adults
# log a user-source `fry-sold` event with the count
```

The log entry carries the typed `fry-sold` event so game-side consumers can
detect the sale programmatically. The engine is **money-free** — "sell"
names the player's intent; any payout is priced on the game side off that
event. No water is lost (fry mass leaves as fish, not decay).

### Considerations
- Clears the whole fry cohort at once; individual removal uses Remove Fish
- No-op (with a message) when there are no fry
- No water loss — purely population management

---

## Maintenance Service

Configurable professional cleaning service.

### Configuration Options

| Action | Options | Default |
|--------|---------|---------|
| Water change | 10%, 25%, 50%, auto | auto |
| Trim plants | to 50%, 85%, 100%, off | off |
| Scrub algae | on, off | on |

**Auto water change:** Adjusts percentage based on nitrate level.

### Behavior

```
if config.water_change != 'off':
    if config.water_change == 'auto':
        percentage = calculate_from_nitrate()
    else:
        percentage = config.water_change
    perform_action("change_water", percentage)

if config.trim_plants != 'off':
    target = config.trim_plants  # 50%, 85%, or 100%
    perform_action("trim_plants", target_biomass=target)

if config.scrub_algae == 'on':
    perform_action("scrub_algae", intensity=0.9)
```

### Considerations
- Scheduled service (e.g., weekly, bi-weekly)
- User configures what actions to include
- "Auto" water change is smart - more nitrate = bigger change

---

## Action Summary

| Action | Primary Effect | Side Effects |
|--------|---------------|--------------|
| Feed | +Food | Uneaten → Waste |
| Clean Substrate | -Waste | Minor bacteria loss (sand excluded) |
| Top Off | +Water | Dilutes concentrations |
| Change Water | -Pollutants | Fish stress if large |
| Dose | +NO3/PO4/K/Fe | Algae if overdone |
| Scrub Algae | -Algae | None |
| Trim Plants | -Biomass | None |
| Add Fish | +1 adult fish | Rejected past physical stocking cap |
| Sell Fry | Remove all fry | None |
| Maintenance | Configurable | Depends on settings |

---

## Action Scheduling

Some actions can be automated:

| Action | Manual | Auto |
|--------|--------|------|
| Feed | Yes | Via Auto Feeder |
| Clean Substrate | Yes | No |
| Top Off | Yes | Via ATO |
| Change Water | Yes | No |
| Dose | Yes | Via Dosing System |
| Scrub Algae | Yes | No |
| Trim Plants | Yes | No |
| Add Fish | Yes | No |
| Sell Fry | Yes | No |
| Maintenance | Yes | Scheduled service |

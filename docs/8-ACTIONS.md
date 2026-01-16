# Actions

User interventions that modify the aquarium state. Actions are triggered by the user and applied immediately (outside the tick loop).

## Purpose

Actions allow the user to:
- Maintain the aquarium (feeding, cleaning, water changes)
- Respond to problems (algae scrubbing, emergency water change)
- Manage livestock (selling fry)
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

Add fertilizers or additives to the tank.

### Inputs
| Parameter | Description |
|-----------|-------------|
| Type | What to dose (nutrients, etc.) |
| Amount | Quantity to add |

### Effects
| Resource | Change |
|----------|--------|
| Nutrients | +amount (if dosing fertilizer) |
| Other | Depends on additive type |

### Behavior

```
if dose_type == "nutrients":
    tank.nutrients += amount
elif dose_type == "pH_up":
    tank.pH += amount * pH_modifier
elif dose_type == "pH_down":
    tank.pH -= amount * pH_modifier
```

### Considerations
- Follow dosing schedules for planted tanks
- Overdosing can cause algae blooms
- Some additives affect multiple parameters

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

## Sell Fry

Shortcut to remove all fry from the tank at once.

### Effects
| Resource | Change |
|----------|--------|
| Fry population | Set to 0 |

### Behavior

```
tank.fry_count = 0
# All fry exit the system
# No water loss - purely population management
```

### Considerations
- Convenience action to clear all fry at once
- Individual fish removal is handled via UI (not a documented action)
- No water loss

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
| Dose | +Nutrients | Algae if overdone |
| Scrub Algae | -Algae | None |
| Trim Plants | -Biomass | None |
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
| Sell Fry | Yes | No |
| Maintenance | Yes | Scheduled service |

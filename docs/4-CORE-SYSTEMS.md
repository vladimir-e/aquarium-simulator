# Core Systems

Biological and physical processes that transform resources in the aquarium. These systems run automatically each tick, modeling the natural chemistry and physics of the ecosystem.

## Purpose

Core systems are the "engine" of the simulation. They:
- Transform inputs into outputs based on physics/biology
- Model natural processes that occur without user intervention
- Create the dynamic equilibrium of a healthy (or unhealthy) tank

---

## Waste Stock

Waste is an abstract resource representing organic matter that feeds the nitrogen cycle. Multiple systems contribute to the waste stock.

### Waste Sources

| Source | Trigger |
|--------|---------|
| Decay System | Processes uneaten food, ambient waste |
| Fish Metabolism | Fish directly produce waste (see 7-LIVESTOCK.md) |
| Plant Overgrowth | Plants past 200% size release waste (decaying leaves) |

### Behavior

Waste accumulates in the tank from all sources and is consumed by the nitrogen cycle (converted to ammonia).

```
tank.waste += decay_output + fish_waste + plant_decay
```

---

## Decay

Decomposition of organic matter into waste.

### Inputs
| Resource | Source |
|----------|--------|
| Food | Uneaten fish food |
| Ambient Waste | Environment (constant, very low - seeds bacteria) |

### Outputs
| Resource | Destination |
|----------|-------------|
| Waste | Added to waste stock |

### Behavior

Uneaten food and ambient debris decompose into waste over time.

```
decay_output = base_rate * temperature_factor * (uneaten_food + ambient_waste)
```

- Higher temperature = faster decay
- More organic matter = more waste produced
- Decay happens continuously

### Thresholds

| Condition | Effect |
|-----------|--------|
| Excessive uneaten food | Rapid waste/ammonia spike |
| High temperature | Accelerated decay |

---

## Nitrogen Cycle

The biological conversion of toxic ammonia to less harmful nitrate.

### Inputs
| Resource | Source |
|----------|--------|
| Waste | From Decay system |
| Ammonia | Fish waste, decaying matter |
| Surface | Equipment (for bacterial colonies) |
| AOB (bacteria) | Ammonia-oxidizing bacteria population |
| NOB (bacteria) | Nitrite-oxidizing bacteria population |

### Outputs
| Resource | Destination |
|----------|-------------|
| Nitrite | Intermediate product |
| Nitrate | End product (removed by plants/water changes) |

### Behavior

The nitrogen cycle is a two-stage bacterial process:

**Stage 1: Ammonia → Nitrite (by AOB)**
```
NH3 + O2 → NO2- + H2O + H+
Ammonia → Nitrite (via Ammonia-Oxidizing Bacteria)
```

**Stage 2: Nitrite → Nitrate (by NOB)**
```
NO2- + O2 → NO3-
Nitrite → Nitrate (via Nitrite-Oxidizing Bacteria)
```

### Bacterial Dynamics

**Growth:**
- Bacteria grow to fill available surface area
- Growth rate depends on food supply (ammonia for AOB, nitrite for NOB)
- Maximum population limited by surface area

**Death:**
- Bacteria die if insufficient waste to sustain them
- Population immediately reduced if surface area decreases (e.g., filter cleaning)

```
bacterial_growth = growth_rate * food_availability * (1 - population/max_population)
bacterial_death = death_rate * (1 - food_availability)
```

### Surface Area Requirement

Surface is provided by:
- Filter media (primary)
- Substrate
- Hardscape (rocks, wood)
- Glass walls

```
max_bacteria = total_surface_area * bacteria_per_unit_surface
```

### Thresholds

| Parameter | Safe | Stress | Lethal |
|-----------|------|--------|--------|
| Ammonia (NH3) | 0 | 0.02-0.05 ppm | > 0.1 ppm |
| Nitrite (NO2) | 0 | 0.1-0.5 ppm | > 1 ppm |
| Nitrate (NO3) | < 20 ppm | 20-40 ppm | > 80 ppm |

---

## Gas Exchange

Equilibration of dissolved gases with the atmosphere.

### Inputs
| Resource | Source |
|----------|--------|
| Flow | Equipment (circulation) |
| Room Temperature | Environment |
| Ambient Oxygen | Environment (atmospheric O2) |

### Outputs
| Resource | Destination |
|----------|-------------|
| Oxygen (O2) | Tank dissolved oxygen |
| CO2 | Tank dissolved CO2 |

### Behavior

Gas exchange occurs at the water surface. Dissolved gases move toward equilibrium with atmospheric concentrations.

**Oxygen:**
- Tank O2 equilibrates toward saturation level
- Saturation depends on temperature (colder = more O2 capacity)
- Flow increases exchange rate

**Carbon Dioxide:**
- Excess CO2 (from respiration, injection) off-gasses
- Atmospheric CO2 dissolves in
- Flow increases exchange rate

```
exchange_rate = base_rate * flow_factor * surface_area
O2_change = exchange_rate * (saturation_O2 - current_O2)
CO2_change = exchange_rate * (atmospheric_CO2 - current_CO2)
```

### Flow Factor

```
flow_factor = min(1.0, total_flow / optimal_flow)
```

- More flow = faster equilibration
- Diminishing returns above optimal flow
- Dead spots (zero flow) = poor gas exchange

### Thresholds

| Parameter | Healthy | Low | Critical |
|-----------|---------|-----|----------|
| Oxygen | > 6 mg/L | 4-6 mg/L | < 4 mg/L |

---

## Temperature

Heat transfer between tank water and environment.

### Inputs
| Resource | Source |
|----------|--------|
| Room Temperature | Environment |
| Heater output | Equipment |
| Chiller output | Equipment |

### Outputs
| Resource | Destination |
|----------|-------------|
| Temperature | Tank water temperature |

### Behavior

Tank temperature is influenced by:
1. **Passive heat transfer** - Tank tends toward room temperature
2. **Active heating** - Heater adds heat when below setpoint
3. **Active cooling** - Chiller removes heat when above setpoint

```
passive_change = heat_transfer_rate * (room_temp - tank_temp)
active_change = heater_output - chiller_output
temperature_change = passive_change + active_change
```

### Thermal Mass

Larger tanks change temperature more slowly:
```
heat_transfer_rate = base_rate / tank_volume
```

### Thresholds

| Species Type | Optimal | Stress | Lethal |
|--------------|---------|--------|--------|
| Tropical | 24-28°C | 22-24°C or 28-30°C | < 20°C or > 32°C |
| Cold water | 18-22°C | 22-26°C | > 28°C |

---

## Evaporation

Water loss to the atmosphere.

### Inputs
| Resource | Source |
|----------|--------|
| Temperature | Tank water temperature |
| Room Temperature | Environment |
| Lid presence | Equipment |

### Outputs
| Resource | Destination |
|----------|-------------|
| Water | Lost to atmosphere |

### Behavior

Water evaporates from the surface. This removes water but NOT dissolved substances, so concentrations increase.

```
evaporation_rate = base_rate * surface_area * temp_factor * (1 - lid_coverage)
```

- Higher temperature = faster evaporation
- Larger surface = more evaporation
- Lid reduces evaporation

### Effect on Concentrations

When water evaporates:
- Volume decreases
- Dissolved substances remain
- Concentrations INCREASE

```
new_concentration = old_concentration * (old_volume / new_volume)
```

### Thresholds

| Condition | Effect |
|-----------|--------|
| Water level < minimum | Equipment malfunction (heater, filter) |
| Rapid evaporation | Concentration spikes |

---

## Dilution

Manages concentration changes when water volume changes.

### Inputs
| Resource | Source |
|----------|--------|
| Water added | ATO, water changes, top-off |
| Water removed | Evaporation, water changes |
| All dissolved resources | Current concentrations |

### Outputs
| Resource | Destination |
|----------|-------------|
| All dissolved resources | Updated concentrations |

### Behavior

Dilution handles the math when water volume changes:

**Water Addition (top-off, ATO):**
- Adds water without adding solutes
- Dilutes all concentrations

```
new_concentration = (old_concentration * old_volume) / new_volume
```

**Water Change:**
- Removes water WITH solutes
- Adds new water with different chemistry

```
# Remove X% of water (and solutes)
concentration_after_removal = old_concentration * (1 - removal_fraction)

# Add new water
final_concentration = concentration_after_removal + (new_water_concentration * removal_fraction)
```

**Evaporation:**
- Removes water WITHOUT solutes
- Concentrates all dissolved substances

```
new_concentration = old_concentration * (old_volume / new_volume)
```

### Interaction with Other Systems

Dilution runs after:
- Evaporation (to handle concentration)
- Water changes (to mix new water)
- ATO (to dilute after top-off)

---

## System Interactions

```
                    ┌──────────────┐
                    │  Environment │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │ Temperature │   │Gas Exchange │   │   Decay     │
  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         │                 │                 ▼
         │                 │          ┌─────────────┐
         │                 │          │  Nitrogen   │
         │                 │          │   Cycle     │
         │                 │          └──────┬──────┘
         │                 │                 │
         ▼                 ▼                 ▼
  ┌─────────────────────────────────────────────────┐
  │                   RESOURCES                      │
  │   (Temperature, O2, CO2, NH3, NO2, NO3, etc.)   │
  └─────────────────────────────────────────────────┘
         │                                   │
         ▼                                   ▼
  ┌─────────────┐                    ┌─────────────┐
  │ Evaporation │                    │  Dilution   │
  └─────────────┘                    └─────────────┘
```

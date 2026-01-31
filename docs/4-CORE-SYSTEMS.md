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

Aerobic decomposition of organic matter, producing waste and affecting dissolved gases.

### Inputs
| Resource | Source |
|----------|--------|
| Food | Uneaten fish food |
| Ambient Waste | Environment (constant, very low - seeds bacteria) |
| Oxygen | Consumed by bacterial respiration |

### Outputs
| Resource | Destination |
|----------|-------------|
| Waste | Added to waste stock (~40% of decayed mass) |
| CO2 | Dissolved in water (from oxidized carbon) |

### Aerobic Decomposition Chemistry

Decay follows aerobic decomposition where bacteria break down organic matter:

```
C6H12O6 + 6O2 → 6CO2 + 6H2O
(Organic matter + Oxygen → Carbon dioxide + Water)
```

**Mass conversion:**
- ~40% of decaying food becomes solid waste
- ~60% is oxidized by bacteria, releasing CO2 and consuming O2
- Gas exchange uses 250 mg/g (~17% of theoretical max) to model gradual bacterial activity

### Behavior

```
decay_amount = base_rate * temperature_factor * food
waste_output = decay_amount * 0.4
oxidized_amount = decay_amount * 0.6
co2_increase = oxidized_amount * 250mg / water_volume  (mg/L)
o2_decrease = oxidized_amount * 250mg / water_volume   (mg/L)
```

- Higher temperature = faster decay (Q10 = 2, rate doubles per 10°C)
- More food = more decay, waste, and gas exchange
- Smaller tanks see larger concentration changes (same mass, less volume)

### Tank Size Impact

Example: 1g food decaying 5% per hour at 25°C

| Tank | CO2 Δ/hr | O2 Δ/hr | Effect |
|------|----------|---------|--------|
| 40L  | 0.19 mg/L | 0.19 mg/L | Noticeable |
| 100L | 0.08 mg/L | 0.08 mg/L | Mild |
| 200L | 0.04 mg/L | 0.04 mg/L | Minimal |

### Thresholds

| Condition | Effect |
|-----------|--------|
| Excessive uneaten food | Rapid waste/ammonia spike, CO2↑, O2↓ |
| High temperature | Accelerated decay and gas exchange |
| Small tank + overfeeding | Dangerous O2 depletion, pH drop from CO2 |

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

The nitrogen cycle is a three-stage process:

**Stage 1: Waste → Ammonia (mineralization)**
```
Organic waste → NH3
Waste decomposes into dissolved ammonia (concentration depends on water volume)
```

**Stage 2: Ammonia → Nitrite (by AOB)**
```
NH3 + O2 → NO2- + H2O + H+
Ammonia → Nitrite (via Ammonia-Oxidizing Bacteria)
```

**Stage 3: Nitrite → Nitrate (by NOB)**
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
| Aeration | Air pump, sponge filter |
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
- Aeration adds direct O2 injection and faster equilibration

**Carbon Dioxide:**
- Excess CO2 (from respiration, injection) off-gasses
- Atmospheric CO2 dissolves in
- Flow increases exchange rate
- Aeration increases CO2 off-gassing rate

```
exchange_rate = base_rate * flow_factor * aeration_factor * surface_area
O2_change = exchange_rate * (saturation_O2 - current_O2) + direct_O2_injection
CO2_change = exchange_rate * co2_offgas_factor * (atmospheric_CO2 - current_CO2)
```

### Flow Factor

```
flow_factor = min(1.0, total_flow / optimal_flow)
```

- More flow = faster equilibration
- Diminishing returns above optimal flow
- Dead spots (zero flow) = poor gas exchange

### Aeration Effects

When aeration is active (air pump or sponge filter):

| Effect | Multiplier | Description |
|--------|------------|-------------|
| Exchange Rate | 2.0x | Surface agitation from bubbles |
| Direct O2 | +0.05 mg/L/hr | Bubble dissolution (when below saturation) |
| CO2 Off-gassing | 1.5x | Bubbles strip dissolved CO2 |

### Thresholds

| Parameter | Healthy | Low | Critical |
|-----------|---------|-----|----------|
| Oxygen | > 6 mg/L | 4-6 mg/L | < 4 mg/L |

---

## Temperature Drift

Passive heat transfer between tank water and environment.

### Inputs
| Resource | Source |
|----------|--------|
| Room Temperature | Environment |
| Current Tank Temperature | Resources |

### Outputs
| Resource | Destination |
|----------|-------------|
| Temperature | Tank water temperature (drift effect) |

### Behavior

Tank water naturally tends toward room temperature through passive heat transfer (Newton's Law of Cooling).

```
temperature_change = heat_transfer_rate * (room_temp - tank_temp)
```

This system models the passive environmental effect. Equipment (heater, chiller) actively counteracts this drift by directly adjusting temperature during equipment processing.

### Thermal Mass

Larger tanks change temperature more slowly:
```
heat_transfer_rate = base_rate / tank_volume
```

This creates realistic behavior where small tanks are harder to maintain stable temperature.

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
- Dissolved substances remain (mass unchanged)
- Concentrations INCREASE automatically (ppm = mass / volume)

### Thresholds

| Condition | Effect |
|-----------|--------|
| Water level < minimum | Equipment malfunction (heater, filter) |
| Rapid evaporation | Concentration spikes |

---

## Dilution & Blending

Manages concentration and temperature changes when water volume changes.

### Inputs
| Resource | Source |
|----------|--------|
| Water added | ATO, water changes, top-off |
| Water removed | Evaporation, water changes |
| All dissolved resources | Current amounts (mass-based) |
| Temperature | Current tank temperature |
| Tap water temperature | Environment setting |

### Outputs
| Resource | Destination |
|----------|-------------|
| All dissolved resources | Updated concentrations |
| Temperature | Blended temperature |

### Behavior

With mass-based storage for dissolved substances, concentration changes are implicit:
- **Concentration (ppm) = mass / water volume**
- When water changes, mass stays constant but concentration changes automatically

**Water Addition (top-off, ATO):**
- Adds water without adding solutes
- Mass unchanged, concentration decreases (dilution)
- Temperature blends toward tap water

```
# Mass unchanged, concentration auto-decreases
# ppm = mass / new_volume

# Temperature blending (heat capacity weighted average)
new_temp = (old_temp * old_volume + tap_temp * added_volume) / new_volume
```

**Water Change:**
- Removes water WITH solutes (proportional mass removal)
- Adds new water (assumed pure for nitrogen compounds)
- Fills tank to 100% capacity

```
# Remove X% of water and mass
mass_after_removal = old_mass * (1 - removal_fraction)

# Add fresh water to capacity
# New water has 0 nitrogen compounds, so mass stays at reduced level
# Temperature blends based on remaining + added volumes
```

**Evaporation:**
- Removes water WITHOUT solutes
- Mass unchanged, concentration increases

### Temperature Blending Formula

When mixing water volumes at different temperatures:

```
new_temp = (temp1 * volume1 + temp2 * volume2) / (volume1 + volume2)
```

This is a heat capacity weighted average, assuming equal specific heat for all water.

### Interaction with Other Systems

Blending occurs during:
- Water changes (temperature + concentration)
- ATO top-off (temperature only, mass unchanged)
- Manual top-off (temperature only)

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
  │Temperature  │   │Gas Exchange │   │   Decay     │
  │   Drift     │   │             │   │             │
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

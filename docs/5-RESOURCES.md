# Resources

Resources are stored in the tank as **stocks** (accumulators). Providers deposit resources, consumers withdraw them.

## Purpose

Resources are measurable quantities that:
- Track the state of the aquarium as stocks
- Accumulate from providers, deplete from consumers
- Determine health outcomes for plants and livestock

## Resource Categories

### Passive Resources
Provided by equipment, calculated each tick:
- **Bacteria Surface** - Area for bacterial colonization (cm²)
- **Light** - Illumination for photosynthesis (watts)
- **Flow** - Water circulation rate (L/h)
- **Aeration** - Active air injection (boolean)

### Physical Resources
Tank-wide physical parameters:
- **Water** - Volume of water in tank
- **Temperature** - Water temperature

### Chemical Resources
Dissolved substances and water chemistry:
- **pH** - Acidity/alkalinity
- **Oxygen (O2)** - Dissolved oxygen
- **CO2** - Dissolved carbon dioxide
- **Ammonia (NH3)** - Toxic fish waste product
- **Nitrite (NO2)** - Intermediate nitrogen compound
- **Nitrate (NO3)** - End product of nitrogen cycle, plant macronutrient
- **Phosphate (PO4)** - Plant macronutrient, from decay and fertilizer
- **Potassium (K)** - Plant macronutrient, from fertilizer only
- **Iron (Fe)** - Plant micronutrient, from fertilizer only

### Biological Resources
Living or organic components:
- **Food** - Fish food
- **Waste** - Organic debris, uneaten food, fish waste
- **Algae** - Single-celled plant growth
- **AOB** - Ammonia-oxidizing bacteria population
- **NOB** - Nitrite-oxidizing bacteria population

---

## Resource Details

### Bacteria Surface

| Property | Value |
|----------|-------|
| **Type** | Passive |
| **Unit** | Square centimeters (cm²) |
| **Providers** | Tank glass, filter (by type), substrate (by type), hardscape (by type) |
| **Consumers** | Bacteria (AOB, NOB) |

**Notes:**
- Total bacteria surface limits bacterial population
- Different equipment provides different surface area (see 3-EQUIPMENT.md)
- Cleaning reduces available surface temporarily

---

### Light

| Property | Value |
|----------|-------|
| **Type** | Passive |
| **Unit** | Watts (W) |
| **Providers** | Light fixtures |
| **Consumers** | Plants (photosynthesis), Algae (growth) |

**Notes:**
- Follows equipment photoperiod schedule
- Wattage affects plant/algae growth rate
- Zero when lights are off

---

### Flow

| Property | Value |
|----------|-------|
| **Type** | Passive |
| **Unit** | Liters per hour (L/h) or tank turnovers per hour |
| **Providers** | Filter, powerhead |
| **Consumers** | Gas exchange system |

**Notes:**
- Affects gas exchange rate
- High flow stresses some fish
- Recommended: 4-10x tank turnover per hour

---

### Aeration

| Property | Value |
|----------|-------|
| **Type** | Passive |
| **Unit** | Boolean (true/false) |
| **Providers** | Air pump, sponge filter (air-driven) |
| **Consumers** | Gas exchange system |

**Notes:**
- Enhances gas exchange rate (2x multiplier)
- Adds direct O2 injection (+0.05 mg/L/hr when below saturation)
- Increases CO2 off-gassing (1.5x multiplier)

---

### Water

| Property | Value |
|----------|-------|
| **Type** | Physical |
| **Unit** | Liters (L) |
| **Providers** | ATO, water changes, top-off actions |
| **Consumers** | Evaporation |

**Notes:**
- Volume affects all concentrations
- Minimum level required for equipment function
- Tank has maximum capacity

---

### Temperature

| Property | Value |
|----------|-------|
| **Type** | Physical |
| **Unit** | Degrees Celsius (°C), 1 decimal precision (e.g., 24.5°C) |
| **Providers** | Heater, environment (room temp) |
| **Consumers** | Chiller, evaporation, gas exchange |

**Notes:**
- Single decimal precision enables accurate Fahrenheit conversion
- Affects metabolic rates of all organisms
- Affects gas solubility
- Species have specific preferred ranges

---

### pH

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Unit** | pH scale (0-14, typically 6-8 in aquariums) |
| **Providers** | Hardscape, tap water, buffers |
| **Consumers** | Biological processes |

**Notes:**
- Logarithmic scale (each unit = 10x change)
- Affected by CO2 (more CO2 = lower pH)
- Affected by nitrogen cycle (nitrification lowers pH)
- Some hardscape raises pH (limestone), some lowers it (driftwood)

---

### Oxygen (O2)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Unit** | mg/L (milligrams per liter) |
| **Typical** | 6-8 mg/L |
| **Providers** | Gas exchange, plant photosynthesis |
| **Consumers** | Fish respiration, bacterial respiration, plant respiration (night) |

**Notes:**
- Saturation decreases with temperature
- Critical for fish survival
- Plants produce O2 in light, consume at night

---

### CO2 (Carbon Dioxide)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Unit** | mg/L or ppm |
| **Typical** | 10-30 mg/L for planted tanks |
| **Providers** | CO2 injection, fish respiration, bacterial respiration |
| **Consumers** | Gas exchange (off-gassing), plant photosynthesis |

**Notes:**
- Essential for plant growth
- Excess can harm fish (> 30 ppm)
- Naturally low without injection (~3-5 ppm)
- Lowers pH when dissolved

---

### Ammonia (NH3)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Storage** | Mass (mg) |
| **Display** | ppm (derived: mass/water) |
| **Safe** | 0 ppm |
| **Providers** | Fish waste, decay, livestock metabolism |
| **Consumers** | AOB bacteria (nitrogen cycle) |

**Notes:**
- Highly toxic to fish
- First stage of nitrogen cycle
- Produced by all livestock metabolism
- Must be converted to nitrite by bacteria
- Mass-based storage: evaporation automatically concentrates

---

### Nitrite (NO2)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Storage** | Mass (mg) |
| **Display** | ppm (derived: mass/water) |
| **Safe** | 0 ppm |
| **Providers** | Nitrogen cycle (from ammonia) |
| **Consumers** | NOB bacteria (nitrogen cycle) |

**Notes:**
- Toxic to fish (less than ammonia)
- Intermediate product
- Indicates cycling in progress
- Must be converted to nitrate by bacteria
- Mass-based storage: evaporation automatically concentrates

---

### Nitrate (NO3)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Storage** | Mass (mg) |
| **Display** | ppm (derived: mass/water) |
| **Optimal** | 10-20 ppm |
| **Providers** | Nitrogen cycle (from nitrite), fertilizer dosing |
| **Consumers** | Plants, algae, water changes |

**Notes:**
- Least toxic nitrogen compound
- Accumulates over time without plants
- Primary nitrogen source for plants
- Natural source from fish bioload via nitrogen cycle
- Also provided by fertilizer dosing
- Mass-based storage: evaporation automatically concentrates

---

### Phosphate (PO4)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Storage** | Mass (mg) |
| **Display** | ppm (derived: mass/water) |
| **Optimal** | 0.5-2 ppm |
| **Providers** | Decay system (trace), fertilizer dosing |
| **Consumers** | Plants, algae |

**Notes:**
- Essential plant macronutrient
- Trace amounts produced by organic decay (fish waste, uneaten food)
- Primary source is fertilizer dosing
- Excess promotes algae growth
- Mass-based storage: evaporation automatically concentrates

---

### Potassium (K)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Storage** | Mass (mg) |
| **Display** | ppm (derived: mass/water) |
| **Optimal** | 5-20 ppm |
| **Providers** | Fertilizer dosing only |
| **Consumers** | Plants |

**Notes:**
- Essential plant macronutrient
- NOT produced by fish waste or decay
- Must be supplemented via dosing for demanding plants
- Low-demand plants can survive without it (slower growth)
- Mass-based storage: evaporation automatically concentrates

---

### Iron (Fe)

| Property | Value |
|----------|-------|
| **Type** | Chemical |
| **Storage** | Mass (mg) |
| **Display** | ppm (derived: mass/water) |
| **Optimal** | 0.1-0.5 ppm |
| **Providers** | Fertilizer dosing only |
| **Consumers** | Plants |

**Notes:**
- Representative micronutrient (stands in for all micros)
- NOT produced by fish waste or decay
- Must be supplemented via dosing for demanding plants
- Low-demand plants can survive without it
- Deficiency limits growth even with adequate macros
- Mass-based storage: evaporation automatically concentrates

---

### Food

| Property | Value |
|----------|-------|
| **Type** | Biological |
| **Unit** | Grams (g), 2 decimal precision (e.g., 0.25g) |
| **Providers** | Feeding actions, auto feeder |
| **Consumers** | Livestock (fish first, then colonies), decay (uneaten) |

**Notes:**
- Fish consume first, leftovers go to colonies
- Uneaten food decays into waste
- Overfeeding causes ammonia spikes

---

### Waste

| Property | Value |
|----------|-------|
| **Type** | Biological |
| **Unit** | Grams (g) |
| **Providers** | Decay system, livestock metabolism, plant overgrowth (>200%) |
| **Consumers** | Nitrogen cycle (converted to ammonia), filter (mechanical removal) |

**Notes:**
- Abstract resource representing organic matter
- Multiple sources contribute to waste stock (see 4-CORE-SYSTEMS.md)
- Source of ammonia via nitrogen cycle
- Removed by filter, vacuuming, water changes

---

### Algae

| Property | Value |
|----------|-------|
| **Type** | Biological |
| **Unit** | Relative (0-100) |
| **Providers** | Light + nitrate + phosphate |
| **Consumers** | Algae-eating colonies (snails, shrimp), scrubbing action |

**Notes:**
- Grows with excess light and nutrients (especially nitrate and phosphate)
- Competes with plants for light, CO2, nitrate, and phosphate
- Thrives when nutrients exceed plant consumption capacity
- Food source for some livestock
- Accumulates on glass, hardscape
- Healthy plant growth starves algae by consuming shared nutrients

---

### AOB (Ammonia-Oxidizing Bacteria)

| Property | Value |
|----------|-------|
| **Type** | Biological |
| **Unit** | Population (relative to surface capacity) |
| **Providers** | Growth on surfaces when ammonia present |
| **Consumers** | Surface cleaning, ammonia depletion |

**Notes:**
- Converts ammonia to nitrite
- Lives on surfaces (filter media, etc.)
- Population limited by surface area
- Dies without ammonia supply

---

### NOB (Nitrite-Oxidizing Bacteria)

| Property | Value |
|----------|-------|
| **Type** | Biological |
| **Unit** | Population (relative to surface capacity) |
| **Providers** | Growth on surfaces when nitrite present |
| **Consumers** | Surface cleaning, nitrite depletion |

**Notes:**
- Converts nitrite to nitrate
- Lives on surfaces (filter media, etc.)
- Population limited by surface area
- Dies without nitrite supply


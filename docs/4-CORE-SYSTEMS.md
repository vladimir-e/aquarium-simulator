# Core Systems

Biological and physical processes that transform resources in the aquarium. These systems run automatically each tick, modeling the natural chemistry and physics of the ecosystem.

## Purpose

Core systems are the "engine" of the simulation. They:
- Transform inputs into outputs based on physics/biology
- Model natural processes that occur without user intervention
- Create the dynamic equilibrium of a healthy (or unhealthy) tank

---

## Oxygen-limited processes

Every aerobic process in the tank — decomposition, both nitrifier guilds, plant
respiration, fish respiration — multiplies its rate by how much oxygen there is
to run on:

```
oxygen_factor = O2 / (K + O2)
```

`K` is the half-saturation constant, the dissolved oxygen at which the process
runs at half its base rate, and each process quotes its own. This is Monod
saturation, the measured kinetics of oxygen-limited metabolism, and it is the
same shape as the Q10 term: a multiplicative modifier on a rate, quoted against
a constant of its own.

| Process | K (mg/L) | Rate left at 8.38 mg/L |
|---------|----------|------------------------|
| Aerobic decomposition | 0.20 | 98 % |
| Ammonia oxidation (AOB) | 0.30 | 97 % |
| Plant respiration | 0.50 | 94 % |
| Fish respiration | 1.00 | 89 % |
| Nitrite oxidation (NOB) | 1.10 | 88 % |

Three consequences follow, and all three are the point:

- **Demand falls with supply.** A tank cannot draw oxygen it does not have,
  because the draw shrinks as the stock does. There is no clamp at the zero
  boundary and no tick-wide ration — the rate carries it.
- **The derived carbon falls with the oxygen.** Each of these processes emits CO2
  derived from the oxygen it consumed, so a suffocating tank stops emitting
  carbon rather than manufacturing it out of oxygen that was never there.
- **The guild that needs the most air suffers first.** NOB carry nearly four
  times AOB's half-saturation constant, so a tank short of air goes on oxidising
  its ammonia long after it has stopped clearing the nitrite that ammonia
  becomes. Standing nitrite in an under-aerated tank is a thing keepers see, and
  this is where it comes from.

Base rates are therefore quoted at saturating oxygen, as measured biological
rates are. The nitrifier rates go one step further and are quoted as Monod
*maxima*: the factor reaches 1 only at infinite oxygen, so the doubling times
and per-cell throughput the constants claim are what the model reproduces in
air-saturated water rather than what the constants themselves hold.

---

## Waste Stock

Waste is an abstract resource representing organic matter that feeds the nitrogen cycle. Multiple systems contribute to the waste stock.

### Waste Sources

| Source | Trigger |
|--------|---------|
| Decay System | Processes uneaten food |
| Substrate Leaching | The bed releases its organic reserve (see 3-EQUIPMENT.md) |
| Fish Metabolism | Fish directly produce waste (see 7-LIVESTOCK.md) |
| Plant Overgrowth | Plants past 200% size release waste (decaying leaves) |

### Behavior

Waste accumulates in the tank from all sources and is consumed by the nitrogen cycle (converted to ammonia).

```
tank.waste += decay_output + substrate_leach + fish_waste + plant_decay
```

---

## Decay

Aerobic decomposition of organic matter, producing waste, phosphate, and affecting dissolved gases.

### Inputs
| Resource | Source |
|----------|--------|
| Food | Uneaten fish food |
| Oxygen | Consumed by bacterial respiration |

### Outputs
| Resource | Destination |
|----------|-------------|
| Waste | Added to waste stock (~40% of decayed mass) |
| CO2 | Dissolved in water (from oxidized carbon) |
| Phosphate | Trace amount dissolved in water |

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
decay_amount = base_rate * temperature_factor * oxygen_factor * food
waste_output = decay_amount * 0.4
oxidized_amount = decay_amount * 0.6
o2_demand_mg = oxidized_amount * 250mg
o2_decrease = o2_demand_mg / water_volume                        (mg/L)
co2_increase = o2_decrease * MW_CO2 / MW_O2                      (mg/L)
phosphate_produced = decay_amount * PHOSPHATE_PER_DECAY  (trace)
```

- Higher temperature = faster decay (Q10 = 2, rate doubles per 10°C)
- Less oxygen = slower decay — the whole process, not only its gas side, so an
  anoxic tank builds sludge instead of mineralising it and the nitrogen bound in
  that sludge stays bound
- More food = more decay, waste, and gas exchange
- Smaller tanks see larger concentration changes (same mass, less volume)
- `250 mg/g` is an oxygen demand; the CO2 is derived from it at the molar ratio,
  so the two gases are one reaction rather than two coefficients

### Phosphate from Decay

Organic matter (fish waste, uneaten food) contains phosphorus. During decomposition, a trace amount is released as dissolved phosphate:

```
phosphate_mg = decayed_mass * 0.01  # ~1% of decayed mass becomes PO4
```

This creates a natural phosphate source from fish bioload, supporting low-demand plants without dosing. However, the amount is insufficient for demanding plants.

### Tank Size Impact

Example: 1g food decaying at 25°C in air-saturated water

| Tank | O2 Δ/hr | CO2 Δ/hr | Effect |
|------|---------|----------|--------|
| 40L  | 0.18 mg/L | 0.25 mg/L | Noticeable |
| 100L | 0.07 mg/L | 0.10 mg/L | Mild |
| 200L | 0.04 mg/L | 0.05 mg/L | Minimal |

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
NH4+ + 1.5 O2 → NO2- + 2 H+ + H2O
Ammonia → Nitrite (via Ammonia-Oxidizing Bacteria), 3.43 mg O2 per mg N
```

**Stage 3: Nitrite → Nitrate (by NOB)**
```
NO2- + 0.5 O2 → NO3-
Nitrite → Nitrate (via Nitrite-Oxidizing Bacteria), 1.14 mg O2 per mg N
```

Both stages pay for themselves in oxygen — 4.57 mg per mg of nitrogen carried
the whole way, three quarters of it on the first step — and the draw is derived
from the nitrogen actually oxidised, not quoted separately.

### Bacterial Dynamics

**Growth:**
- Proportional to `utilization` — the share of its processing capacity the colony used this tick
- Full `growth_rate` only on non-limiting substrate; nothing to oxidise means no growth
- Maximum population limited by surface area

**Death:**
- Unconditional maintenance loss, so a cut-off colony fades over weeks rather than collapsing
- Population immediately reduced if surface area decreases (e.g., filter cleaning)
- A colony is a stock sitting on surface, so surface that leaves the tank takes its share of the colony with it — see *Substrate* in [3-EQUIPMENT](3-EQUIPMENT.md) for what a rescape costs

```
utilization         = substrate_consumed / processing_capacity   # 0..1
processing_capacity = population * processing_rate * warmth * air
bacterial_growth    = population * growth_rate * warmth * air * utilization * (1 - population/max_population)
bacterial_death     = population * death_rate * warmth
```

`air` is the guild's own oxygen factor from *Oxygen-limited processes* above. It
scales oxidation and growth alike — a colony cannot divide on a reaction it
cannot run — but deliberately not maintenance decay, which is what makes an
anoxic tank lose its biofilter rather than merely pause it.

Processing capacity carries no volume term. Throughput is a property of the
cell, so the same colony clears the same milligrams in a nano and in a 150 L,
and `utilization` is dimensionless in both. `warmth` is the temperature factor
below.

A **bacteria unit is 10⁶ cells**, which is what makes `bacteria_per_unit_surface`
a real biofilm density rather than a score. The three constants — processing
rate, ceiling density, inoculum — carry an exact gauge symmetry, so one
of them is a units convention and the ceiling density is the one pinned.

`growth_rate` is read off a saturated doubling time (`ln2 / hours`) and
`death_rate` off a starvation half-life. A colony under a steady load settles
where the two cancel — `utilization = death_rate / (growth_rate * air)` while
the surface ceiling is far off, higher once the logistic term starts braking.

The surface ceiling is not, in practice, what a biofilter meets. Any load big
enough to fill the biofilm is a load whose oxygen demand strips the water first:
a bare 200 L held under a saturating ammonia dose settles at 95 % of its surface
for AOB and 53 % for NOB, against 96 % / 94 % with the oxygen term switched off.
Oxygen is the binding constraint on a mature colony, and NOB feel it first.

The **inoculum** is the third constant on this clock: everything between a
seeded tank and a cycled one is doublings, so it sets how many there are. It is
a count per litre — nitrifiers arrive dissolved in the fill water and out of the
air above it, then settle onto whatever surface is going, so a bare-bottom tank
seeds on its filter media like any other and the cycling timeline is the same at
10 L and 1000 L.

```
inoculum = tank_capacity * inoculum_per_liter
```

Per litre and not per cm² because the ammonia supply is per litre too: the seed
and the load it has to catch scale together, which is what holds the clock
steady across volumes.

### Temperature

Nitrification is enzymatic, so all three colony rates carry the same Q10
factor against the temperature they are quoted at:

```
warmth = q10 ^ ((temperature - reference_temp) / 10)
```

One metabolism, one factor: a cell that oxidises half as fast also divides and
starves half as fast. So a cold tank needs a larger colony to clear the same
load and takes longer to build it — an 18 °C cycle runs about twice the days a
25 °C one does — while the utilization a colony rests at does not move with
temperature.

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

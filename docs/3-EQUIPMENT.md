# Equipment

Hardware components that exist in or on the aquarium. Each piece of equipment provides passive effects and/or active effects that modify resources.

## Purpose

Equipment modifies the tank environment by:
- Providing passive benefits (bacteria surface area, flow, light)
- Actively producing effects (heating, CO2 injection, feeding)
- Creating conditions necessary for biological processes

## Effect Types

**Passive Effects (always provided when equipment exists):**
- Flow (L/h)
- Light (watts)
- Bacteria Surface Area (cm²)

**Active Effects (deposit/withdraw from resource stocks):**
- CO2
- Food
- Nutrients
- Temperature
- Water

**Note:** pH is not directly provided by equipment. pH changes occur through the Dilution system when water chemistry changes.

## Equipment Scheduling

Equipment with schedules (lights, CO2, feeder, dosing) have:

| Property | Description |
|----------|-------------|
| **Enabled** | On/Off - can be toggled anytime |
| **Schedule** | On/Off - if On, schedule controls the device |
| **Start Hour** | 0-23, when device activates |
| **Duration** | Hours the device stays on (where applicable) |
| **Frequency** | Daily, every X hours, etc. |

**Behavior:**
- If Schedule is OFF → user manually controls device state
- If Schedule is ON → device follows schedule automatically
- Any equipment can be disabled entirely at any time

---

## Tank

The aquarium itself. Provides the fundamental container for the ecosystem.

| Property | Description |
|----------|-------------|
| **Volume** | Liters of water capacity |
| **Bacteria Surface Area** | Glass walls available for bacterial colonization (cm²) |

**Derived Properties:**

| Property | Derived From | Used By |
|----------|--------------|---------|
| Water Surface Area | Volume (assuming standard shape) | Gas exchange, evaporation, temperature |
| Hardscape Slots | 2 per gallon, max 8 | Limits hardscape items |
| Stocking Capacity | Volume | Fish limits |

---

## Filter

Mechanical and biological filtration. Different filter types provide different capabilities.

| Property | Description |
|----------|-------------|
| **Type** | Sponge, HOB, Canister, Sump |
| **Flow Rate** | Liters per hour |
| **Bacteria Surface Area** | Based on filter type (cm²) |

**Filter Types:**

| Type | Flow Rate | Bacteria Surface | Notes |
|------|-----------|------------------|-------|
| Sponge | Low | Medium | Simple, good for fry tanks |
| HOB (Hang-on-Back) | Medium | Medium | Common, easy maintenance |
| Canister | High | High | External, high capacity |
| Sump | Very High | Very High | Separate tank, most capacity |

**Outputs:**
- +Flow (water circulation)
- +Bacteria Surface Area

**Behavior:**
- Provides surface area for beneficial bacteria (AOB, NOB)
- Circulates water, enabling gas exchange
- Mechanically traps waste particles
- Cleaning removes some bacteria along with waste

---

## Powerhead

Additional water circulation pump.

| Property | Description |
|----------|-------------|
| **Flow Rate** | Liters per hour |

**Outputs:**
- +Flow (additional circulation)

**Behavior:**
- Increases overall tank flow
- Helps eliminate dead spots
- Enhances gas exchange

---

## Substrate

Bottom layer of the tank. Type affects which plants can be rooted.

| Property | Description |
|----------|-------------|
| **Type** | None, Sand, Gravel, Aqua Soil |

**Substrate Types:**

| Type | Bacteria Surface | Plant Rooting | Nutrients | Can Vacuum |
|------|------------------|---------------|-----------|------------|
| None | None | No | No | N/A |
| Sand | Low | Yes (some plants) | No | No |
| Gravel | Medium | Yes | No | Yes |
| Aqua Soil | High | Yes (all plants) | Yes (slow release) | Yes |

**Behavior:**
- Bacteria surface area calculated assuming optimal amount for tank size
- Plants requiring substrate check against type (sand or aqua soil)
- Aqua soil slowly releases nutrients over time
- Sand cannot be vacuumed (too fine)

---

## Hardscape

Rocks, driftwood, decorations. Tank provides slots for hardscape items.

| Property | Description |
|----------|-------------|
| **Slots Available** | 2 per gallon, max 8 |

**Hardscape Types:**

| Type | Bacteria Surface | pH Effect | Notes |
|------|------------------|-----------|-------|
| Neutral Rock | High | None | Inert stone |
| Calcite Rock | High | +pH (raises) | Calcium-based rock |
| Driftwood | Medium | -pH (lowers) | Releases tannins |
| Plastic Decoration | Low | None | Smooth surface |

**Behavior:**
- Each item occupies one slot
- Multiple items of same type allowed
- pH effects processed by Dilution system
- Provides hiding spots (reduces fish stress)

---

## Light

Aquarium lighting system.

| Property | Description |
|----------|-------------|
| **Watts** | Power (e.g., 50W, 100W) |
| **Schedule** | Start hour + duration |

**Outputs:**
- +Light (watts for photosynthesis)

**Behavior:**
- Drives plant photosynthesis when on
- Promotes algae growth (especially if excessive)
- Follows schedule: starts at Start Hour, runs for Duration
- `hourOfDay` determines if lights are on

---

## Heater

Temperature control - heating.

| Property | Description |
|----------|-------------|
| **Wattage** | Heating power |
| **Setpoint** | Target temperature (°C, 1 decimal) |

**Outputs:**
- +Temperature (raises water temp toward setpoint)

**Behavior:**
- **Automatic thermostat** - activates when temp < setpoint
- Turns off when setpoint reached
- Fights against room temperature cooling
- Essential for tropical fish

---

## Chiller

Temperature control - cooling.

| Property | Description |
|----------|-------------|
| **Capacity** | Cooling power |
| **Setpoint** | Target temperature (°C, 1 decimal) |

**Outputs:**
- -Temperature (lowers water temp toward setpoint)

**Behavior:**
- **Automatic thermostat** - activates when temp > setpoint
- Turns off when setpoint reached
- Fights against room temperature heating
- Used in hot climates or for cold-water species

---

## Lid

Tank cover.

| Property | Description |
|----------|-------------|
| **Type** | None, Mesh, Full, Sealed |

**Lid Types:**

| Type | Evaporation | Jump Protection | Gas Exchange |
|------|-------------|-----------------|--------------|
| None | 100% | No | Full |
| Mesh | Reduced | Yes | Full |
| Full | Reduced | Yes | Reduced |
| Sealed | 0% | Yes | Minimal |

**Behavior:**
- Reduces or stops evaporation based on type
- Prevents fish jumping out (except None)
- Sealed lids significantly limit gas exchange

---

## CO2 System

Carbon dioxide injection for planted tanks.

| Property | Description |
|----------|-------------|
| **Injection Rate** | mg/hour |
| **Schedule** | Start hour + duration (typically matches lights) |

**Outputs:**
- +CO2 (dissolved carbon dioxide)

**Behavior:**
- Increases CO2 for plant photosynthesis
- Should be scheduled with lights (off at night when plants respire)
- Excessive CO2 can harm fish (> 30 ppm)

---

## Dosing System

Automated fertilizer dosing.

| Property | Description |
|----------|-------------|
| **Dose Amount** | Milliliters per dose |
| **Schedule** | Frequency, start hour |

**Outputs:**
- +Nutrients (milliliters)

**Behavior:**
- Adds nutrients on schedule
- Supports plant growth
- Overdosing can promote algae

---

## Auto Top Off (ATO)

Automatic water level maintenance.

| Property | Description |
|----------|-------------|
| **Trigger** | Water level falls below 99% |
| **Source** | Tap water |

**Outputs:**
- +Water (restores to 100%)

**Behavior:**
- Detects when water level < 99%
- Adds tap water to restore level
- **Does dilute chemistry** - new water enters, affecting concentrations
- Like a water change without first removing water
- Tap water pH affects tank pH through Dilution system

---

## Auto Feeder

Automatic fish feeding.

| Property | Description |
|----------|-------------|
| **Portion Size** | Grams per feeding |
| **Schedule** | Frequency, feeding times |

**Outputs:**
- +Food (grams)

**Behavior:**
- Dispenses food on schedule
- Uneaten food decays into waste
- Enables vacation feeding

---

## Equipment Summary

| Equipment | Flow | Light | Bacteria Surface | Other Effects |
|-----------|------|-------|------------------|---------------|
| Tank | | | Yes | Volume, water surface, slots |
| Filter | Yes | | Yes (by type) | -Waste |
| Powerhead | Yes | | | |
| Substrate | | | Yes (by type) | +Nutrients (aqua soil) |
| Hardscape | | | Yes (by type) | ±pH (by type) |
| Light | | Yes | | Schedule |
| Heater | | | | +Temp (thermostat) |
| Chiller | | | | -Temp (thermostat) |
| Lid | | | | -Evaporation, -gas exchange |
| CO2 | | | | +CO2, schedule |
| Dosing | | | | +Nutrients, schedule |
| ATO | | | | +Water (dilutes) |
| Feeder | | | | +Food, schedule |

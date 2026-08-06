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
- Light (PAR at the substrate, µmol/m²/s)
- Bacteria Surface Area (cm²)
- Aeration (boolean)

**Active Effects (deposit/withdraw from resource stocks):**
- CO2
- Food
- Nitrate, Phosphate, Potassium, Iron (via dosing)
- Temperature
- Water

**Note:** pH is not directly provided by equipment. pH changes occur through the Dilution system when water chemistry changes.

## Schedule System

Equipment can operate on automated schedules using the centralized scheduling system.

### DailySchedule Interface

```typescript
interface DailySchedule {
  startHour: number  // 0-23, when equipment activates
  duration: number   // hours equipment stays on
}
```

Schedules repeat every 24 hours and support midnight wrap-around (e.g., 10pm-6am).

### Equipment Using Schedules

Current equipment with schedule support:
- **Light** - Photoperiod automation (e.g., 8am-6pm, 10 hours)
- **CO2** - Typically matches light schedule (off at night)
- **Auto Feeder** - Multiple daily feeding times (not yet implemented)
- **Dosing System** - Periodic fertilizer dosing (not yet implemented)

### Schedule Behavior

Each scheduled equipment has:
- **enabled** - Master on/off switch (disables equipment entirely)
- **schedule** - DailySchedule configuration

**Processing:**
1. `hourOfDay = tick % 24` determines current hour
2. `isScheduleActive(hourOfDay, schedule)` checks if equipment should be on
3. Equipment only operates if both `enabled = true` AND schedule is active

**Midnight Wrap-Around:**
- Schedule `{ startHour: 22, duration: 8 }` means active from 22:00-5:59 (wraps around midnight)
- Schedule `{ startHour: 8, duration: 10 }` means active from 8:00-17:59 (no wrap)

### Manual Override

Equipment can be disabled at any time by setting `enabled = false`, regardless of schedule state.

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

| Type | Target Turnover | Max Tank | Max Flow | Bacteria Surface | Air-Driven | Notes |
|------|-----------------|----------|----------|------------------|------------|-------|
| Sponge | 4x/hr | 75L (~20 gal) | 300 L/h | 8,000 cm² | Yes | Simple, provides aeration |
| HOB (Hang-on-Back) | 6x/hr | 208L (~55 gal) | 1,250 L/h | 15,000 cm² | No | Common, easy maintenance |
| Canister | 8x/hr | 568L (~150 gal) | 4,500 L/h | 25,000 cm² | No | External, high capacity |
| Sump | 10x/hr | Unlimited | Unlimited | 40,000 cm² | No | Separate tank, most capacity |

Flow rate scales with tank size: `flow = tankCapacity × targetTurnover`, capped at max flow.

**Outputs:**
- +Flow (water circulation)
- +Bacteria Surface Area
- +Aeration (sponge filter only - air-driven operation)

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

## Air Pump

Air-driven aeration via air stones.

| Property | Description |
|----------|-------------|
| **Enabled** | On/off toggle |
| **Output** | Liters per minute (auto-scales to tank size) |

**Output Scaling:**

| Tank Size | Air Output | Flow Contribution |
|-----------|------------|-------------------|
| ≤ 40L | 1.0 LPM | 6 L/h |
| 41-150L | 2.0 LPM | 12 L/h |
| 151-400L | 4.0 LPM | 24 L/h |
| > 400L | 6.7 LPM | 40 L/h |

**Outputs:**
- +Aeration
- +Flow (~10% of air output from bubble uplift)

**Behavior:**
- Increases gas exchange rate (2x multiplier)
- Adds direct O2 injection (+0.05 mg/L/hr when below saturation)
- Increases CO2 off-gassing (1.5x multiplier)

---

## Substrate

Bottom layer of the tank. Type affects which plants can be rooted.

| Property | Description |
|----------|-------------|
| **Type** | None, Sand, Gravel, Aqua Soil |
| **Organic Reserve** | Organic matter left in the bed (g), set from type × capacity when the tank is created |

**Substrate Types:**

| Type | Bacteria Surface | Organic Reserve | Plant Rooting | Can Vacuum |
|------|------------------|-----------------|---------------|------------|
| None | 0 cm²/L | 0 g/L | No | N/A |
| Sand | 400 cm²/L | 0.011 g/L | Yes (some plants) | No |
| Gravel | 800 cm²/L | 0.013 g/L | Yes | Yes |
| Aqua Soil | 1,200 cm²/L | 0.050 g/L | Yes (all plants) | Yes |

**Behavior:**
- Bacteria surface area calculated assuming optimal amount for tank size
- Plants requiring substrate check against type (sand or aqua soil)
- Sand cannot be vacuumed (too fine)

**Organic leaching:**

Surface is the bacteria ceiling; the organic reserve is an ammonia source. They are separate quantities — a bed can be a good home for bacteria without feeding them.

Each tick the bed releases `substrateLeachRate` (0.3 %/hr) of whatever reserve is left into the waste pool, where the nitrogen cycle mineralizes it like any other organic matter. Because both the reserve and the release are per-litre quantities, concentration is volume-independent — a 20 L and a 150 L tank cycle on the same timeline.

The leach is a source and the bacteria are a sink; the source never asks about the sink. A tank that already carries a biofilter shows a blip where a fresh one shows the full ramp, because the colony that survived the swap eats most of the leach — not because the leach is switched off.

**Reserve lifecycle.** The reserve belongs to the bed currently in the tank and only ever falls while that bed stays put. A water change removes dissolved ammonia and leaves the bed alone. Changing the substrate *type* replaces the bed, so the reserve refills for the new type (to zero for `none`); re-selecting the type already in the tank is not a rescape and changes nothing.

A rescape therefore starts a fresh ammonia ramp **and** takes the biofilm out in the bucket. A colony is a stock spread over every colonisable cm² the tank has, so pulling the bed removes the share that was living on it — most of it in a large tank, where the bed dwarfs the glass and the filter media — and the bed that replaces it arrives sterile. Ammonia and nitrite both come back up for a few days and then clear: punishing, and exactly what pulling a substrate does to a real tank.

The resulting behaviour, fishless and unfed:

| Type | Crosses 0.5 ppm NH₃ | Ammonia delivered | Spent |
|------|---------------------|-------------------|-------|
| Aqua Soil | day 2–4 | ~3 ppm | ~8 weeks |
| Gravel | ~2 weeks | ~0.8 ppm | ~8 weeks |
| Sand | ~3 weeks | ~0.7 ppm | ~8 weeks |
| None | never | 0 | — |

---

## Hardscape

Rocks, driftwood, decorations. Tank provides slots for hardscape items.

| Property | Description |
|----------|-------------|
| **Slots Available** | 2 per gallon, max 8 |

**Hardscape Types:**

| Type | Bacteria Surface | pH Effect | Notes |
|------|------------------|-----------|-------|
| Neutral Rock | 400 cm² | None | Inert stone |
| Calcite Rock | 400 cm² | +pH (raises) | Calcium-based rock |
| Driftwood | 650 cm² | -pH (lowers) | Releases tannins |
| Plastic Decoration | 100 cm² | None | Smooth surface |

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
| **PAR** | Rated PAR at the water surface, µmol/m²/s (25, 50, 90, 150) |
| **Schedule** | Start hour + duration |

**Outputs:**
- +Light (PAR at the substrate, for photosynthesis)

**Behavior:**
- A fixture is rated at the water surface; the tank runs on what reaches the
  substrate. Depth comes from capacity (the 2:1:1 box the glass surface
  already assumes) and the water column attenuates 1 %/cm, so the same
  fixture lands 81 % of its rating on a 20 L floor and 59 % on a 300 L
- On the 150 L reference tank the four fixtures read 16 / 33 / 59 / 98 PAR at
  the substrate — the hobby's low / medium / high / very high tiers
- A rating is capped at `MAX_LIGHT_PAR` (2000, full noon sunlight at the
  surface); `createSimulation` refuses anything past it
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

Automated fertilizer dosing with all-in-one fertilizer.

| Property | Description |
|----------|-------------|
| **Enabled** | On/off toggle |
| **Dose Amount** | Milliliters per dose |
| **Schedule** | DailySchedule (doses once at start hour) |

### Fertilizer Formula

All-in-one fertilizer provides balanced nutrients per milliliter:

| Nutrient | Amount per ml |
|----------|---------------|
| Nitrate (NO3) | 5.0 mg |
| Phosphate (PO4) | 0.5 mg |
| Potassium (K) | 2.0 mg |
| Iron (Fe) | 0.1 mg |

**Outputs:**
- +Nitrate (mg)
- +Phosphate (mg)
- +Potassium (mg)
- +Iron (mg)

**Behavior:**
- Doses once per day at schedule start hour
- Adds all nutrients proportionally per formula
- Typical dose: 1-5 ml depending on tank size and plant load
- Supports plant growth for medium and high demand species
- Overdosing promotes algae (relaxed threshold ~2-3x optimal)

**Natural vs Dosed Tanks:**
- **Without dosing**: Nitrogen cycle provides nitrate, decay provides trace phosphate. Sufficient for low-demand plants only.
- **With dosing**: Full nutrient supplementation enables high-demand plant growth.

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

| Equipment | Flow | Light | Bacteria Surface | Aeration | Other Effects |
|-----------|------|-------|------------------|----------|---------------|
| Tank | | | Yes | | Volume, water surface, slots |
| Filter | Yes | | Yes (by type) | Sponge only | -Waste |
| Powerhead | Yes | | | | |
| Air Pump | Yes (small) | | | Yes | +O2 direct, CO2 off-gassing |
| Substrate | | | Yes (by type) | | Plant rooting |
| Hardscape | | | Yes (by type) | | ±pH (by type) |
| Light | | Yes | | | Schedule |
| Heater | | | | | +Temp (thermostat) |
| Chiller | | | | | -Temp (thermostat) |
| Lid | | | | | -Evaporation, -gas exchange |
| CO2 | | | | | +CO2, schedule |
| Dosing | | | | | +NO3/PO4/K/Fe, schedule |
| ATO | | | | | +Water (dilutes) |
| Feeder | | | | | +Food, schedule |

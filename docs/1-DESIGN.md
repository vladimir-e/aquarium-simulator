# Aquarium Simulator - System Design

## Overview

A comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment. The simulation tracks resources flowing between components: environment, equipment, core biological/physical systems, plants, livestock, and user actions.

## Design Principles

- **Accurate simulation** - Physics and biology should be realistic
- **Clean architecture** - Elegant solutions over immediate wins
- **Extensibility** - Simple and clean but open for expansion

## Control Hierarchy

The simulation is built as a five-layer control hierarchy. Each layer
has one job, and abstractions don't leak across boundaries: the player
drives the player layer; subsystems drive resources; resources drive
vitality; vitality drives outcomes.

```
  Player layer       equipment + actions
       │
       ▼
  Resource layer     temperature, pH, gases, nitrogen, nutrients, …
       ▲
       │             (subsystems are the engine in both directions)
       ▼
  Subsystem layer    nitrogen cycle, gas exchange, photosynthesis,
                     respiration, decay, evaporation, drift
       │
       ▼
  Vitality layer     stressors / benefits / condition / surplus
                     (universal organism interface)
       │
       ▼
  Outcome layer      growth, biomass cap, death, breeding, …
```

### 1. Player layer

Equipment configuration (heater setpoint, filter on/off, light schedule,
CO2 system, ATO, auto-doser) and actions (feed, water change, dose,
plant, trim, scrub algae). This is the only layer the player interacts
with. The player does not edit resources directly — every effect on the
tank flows through equipment or actions.

### 2. Resource layer

The physical and chemical state of the tank: water volume, temperature,
pH, dissolved gases (O2, CO2), nitrogen species (NH3, NO2, NO3),
nutrients (PO4, K, Fe), light intensity, flow, surface area, food,
waste, bacteria (AOB, NOB). Resources are continuous floats; the
tank is a stock for each. See `5-RESOURCES.md` for the catalogue.

Algae used to live here as a single number; it has been promoted to
an organism in the vitality layer (`state.algae`). See `6-PLANTS.md`
§ Algae as an organism for the new shape.

### 3. Subsystem layer

The dynamics that transform resources tick by tick: nitrogen cycle, gas
exchange, photosynthesis, respiration, decay, evaporation, pH drift,
temperature drift, dilution. Subsystems are driven by organism activity
(fish respiring, plants photosynthesizing, waste decaying) and by
equipment effects (filter circulating, heater warming, light powering
photosynthesis). They are the **mechanism**, not the **content**:
players don't manage NH3 directly — they manage filtration, bioload,
and water changes, and the nitrogen-cycle subsystem translates that
into NH3 → NO2 → NO3 dynamics. See `4-CORE-SYSTEMS.md`.

### 4. Vitality layer

Every organism (plants, fish) experiences resources as **stressors**
(damage rate) and **benefits** (recovery rate). Net rate drives
`condition` (0–100); when net is positive at full condition the
overflow accrues into **surplus** — a saturating reserve bank that
doubles as a lifecycle-outcome stock. The bank also buffers damage:
when net is negative it drains before condition falls, so a
well-stocked organism shrugs off a bad tick by burning reserves. The
vitality layer is the universal organism interface; species-specific
configs map resources to factors but the math is shared across
species. See § The Vitality Engine below.

### 5. Outcome layer

Growth, biomass cap, death. Outcomes are gated by the vitality +
surplus path: a stressed organism heals first, surplus only flows once
condition is full. This is the trajectory shape — recover, then grow —
that the player's choices ultimately produce.

## The Vitality Engine

A single pure module (`src/simulation/systems/vitality.ts`) is the
universal organism interface. It takes a list of stressors, a list of
benefits, a hardiness factor, the current condition, and the current
surplus bank (plus its cap); it returns a new condition, the new bank,
and a per-factor breakdown for UI and telemetry.

```
input  : { stressors[], benefits[], hardiness, condition,
           surplus, surplusCap, accrueSurplus? }
output : { newCondition, surplus, breakdown }
```

Algorithm:

1. `damageRate = Σ stressor.amount × (1 − hardiness)`
2. `benefitRate = Σ benefit.amount` (no hardiness scaling)
3. `net = benefitRate − damageRate`
4. Bank clamps into `[0, surplusCap]` on entry (an over-cap value from
   an old save self-heals on the first tick).
5. Condition + bank update:
   - `net < 0` → the bank absorbs the damage first
     (`drain = min(bank, |net|)`); condition declines only by the
     shortfall the bank can't cover (clamped at 0).
   - `net > 0`, condition < 100 → condition heals; the bank is idle
     (overshoot past 100 is spent on the final fraction, not banked).
   - `net > 0`, condition = 100 → condition stays full; overflow
     accrues into the bank up to `surplusCap`, discarding the rest.

Step 5's branching enforces the "recover then grow" trajectory: a
stressed organism cannot make progress while its condition is below
100 %. The healing burns the entire benefit budget until the deficit is
paid down. The reserve bank sits one layer above — it protects
condition from damage and only fills once condition is full.

The buffer means **condition 100 no longer implies "thriving"**: an
organism under attack reads 100 while burning reserves. The breakdown
exposes `drained` (reserve spent this tick) so consumers derive the
"burning reserves" signal from `condition 100 + net < 0`.

Each species module decides which resources count as stressors vs.
benefits and at what severity; they all share the same vitality math.
`accrueSurplus` gates whether positive overflow banks this tick (fish
always accrue; plants pass `light > 0`); draining and the cap clamp
apply regardless. See `6-PLANTS.md` § Plant Condition and
`7-LIVESTOCK.md` § Health (Vitality) for the species-specific factor
lists.

## The Surplus Economy

Surplus is a **saturating reserve bank** that doubles as the
lifecycle-outcome stock. It accumulates when an organism is at full
condition with positive net rate — *the player has stocked good
conditions and maintained them well enough that the organism has energy
to spare* — up to a shared cap (`surplusCap`, default 50, half the
condition scale). Accrual beyond the cap is discarded, not queued: a
body banks only so much reserve, like vitamin absorption.

The bank protects condition. When net turns negative the reserve drains
before condition falls, so a well-stocked organism holds full condition
through a bad tick while burning down its buffer; condition only starts
declining once the reserve is spent. Draining is not photoperiod- or
condition-gated — the reserve defends the organism at any hour and at
any condition level. This is why **condition 100 no longer means
"thriving"**: it can mean "full and stable" or "full but bleeding
reserves under attack." Vitality owns the whole bank transition — drain,
accrual, and cap — and returns the new bank value; the caller just
stores it and spends from it.

- **Plants.**
  - Vitality returns the new `Plant.surplus` bank each tick.
  - **Accrual** is **photoperiod-gated**: plant surplus represents
    stored photosynthate (sugars from carbon fixation), so overflow at
    full condition only banks when `resources.light > 0`. Overnight
    overflow is discarded — no photosynthesis means no energy capture.
    (Plant *condition* still heals at night from non-light benefits, and
    the reserve still buffers damage overnight; only the accrual step
    pauses.)
  - Each tick of the photoperiod, growth drains up to a configured
    cap from the bank; the drained units convert to size at a rate
    scaled by species growth rate and an asymptotic factor that
    decays toward zero as size approaches species `maxSize`. So a
    young plant grows fast, a mature plant slows down, and a plant
    at its ceiling stops growing entirely. Growth is also
    photoperiod-gated: overnight respiration burns sugars for
    maintenance, not net biomass accumulation, so growth doesn't
    drain the bank at night either.
  - Once a plant reaches `species.maxSize`, growth stops; surplus
    continues to bank on `Plant.surplus` up to the cap. The bank is the
    canonical lifecycle-outcome stock for plants — the field exists, it
    accumulates, consumers attach to it.
- **Fish.** Vitality returns the new `Fish.surplus` bank. Fish are
  fixed-mass adults; the bank is their reserve buffer and the canonical
  lifecycle-outcome stock, saturating at the cap for the future
  breeding mechanic to spend.
- **Algae.** The bloom has no condition — its stock is `mass`. The
  orchestrator folds net rate into the same reserve bank: positive net
  accrues (capped, photoperiod-gated); negative net drains the reserve
  before mass shrinks, so a stocked bloom rides out a hostile tick.

A planted tank illustrates the loop: a healthy plant heals to
condition 100, banks surplus on each subsequent daylight tick, drains
some to grow, and as it approaches `maxSize` the asymptotic dampener
slows visible growth while the bank fills toward the cap.

This is the player's loop in one line: **stack positives, fix
negatives, accumulate surplus.** A barely-surviving tank stays alive
but produces nothing; a thriving tank banks surplus and grows. The
asymmetry between maintenance and progress is by design — it's what
makes good husbandry distinguishable from minimum viable husbandry.

## Simulation Model

### Time Model
- **1 tick = 1 hour** of simulation time
- `hourOfDay = tick % 24` (0-23)
- `dayNumber = floor(tick / 24)`
- Each tick updates all systems in dependency order
- Actions are applied at tick boundaries

### Resource Model
- **Continuous values (floats)** - Smooth gradual changes
- **Tank as stock** - For each resource, the tank acts as a stock (accumulator)
  - Providers deposit resources into the tank
  - Consumers withdraw resources from the tank
- Concentrations adjust with water volume changes

### Spatial Model
- **Homogeneous tank** - Single uniform volume
- No zones or spatial gradients
- All parameters are tank-wide averages

### Entity Model
- **Individual organisms** - Fish tracked individually with health, age, hunger
- **Population-based colonies** - Snails/shrimps as single aggregate organism

### Effect System

**Core systems** emit **effects** - simple data objects describing resource changes:

```typescript
{ tier: 'active', resource: 'food', delta: -2, source: 'fish' }
```

Effects are processed in **three tiers** with commits between each:

| Tier | Examples | Description |
|------|----------|-------------|
| **IMMEDIATE** | Temperature drift, evaporation | Environmental forces |
| **ACTIVE** | Living processes | Fish eat, plants photosynthesize |
| **PASSIVE** | Chemical/biological processes | Decay, nitrogen cycle, gas exchange |

**System Registry Pattern:**

Each core system implements a common interface:

```typescript
interface System {
  id: string
  tier: EffectTier
  update(state: SimulationState): Effect[]
}
```

Systems are registered in a central list and automatically invoked during their tier.

**Architectural Note:** Only core systems use the effect pattern. Equipment and user actions mutate state directly using Immer for immutability.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENVIRONMENT                               │
│         (Room temp, Tap water pH, Ambient waste, O2)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         EQUIPMENT                                │
│   Tank, Filter, Heater, Chiller, Light, CO2, Dosing, etc.       │
│                                                                  │
│   Passive effects: Flow, Light, Surface                         │
│   Active effects: consume/produce resources                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CORE SYSTEMS                               │
│                                                                  │
│   Nitrogen Cycle    Gas Exchange    Temperature                 │
│   Decay             Evaporation     Dilution                    │
│                                                                  │
│   (Transform resources based on physics/biology)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        RESOURCES                                 │
│                                                                  │
│   Water, Temperature, pH, O2, CO2, Ammonia, Nitrite, Nitrate    │
│   Phosphate, Potassium, Iron, Light, Flow, Surface              │
│   Food, Waste, Bacteria (AOB, NOB)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌───────────────────────┐   ┌───────────────────────┐
│        PLANTS         │   │       LIVESTOCK       │
│                       │   │                       │
│   Photosynthesis      │   │   Metabolism          │
│   Growth              │   │   Reproduction        │
│                       │   │   Predation           │
│                       │   │   Health/Stressors    │
└───────────────────────┘   └───────────────────────┘
                    │                   │
                    └─────────┬─────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ACTIONS                                  │
│                                                                  │
│   Feed, Water Change, Top Off, Dose, Clean, Trim, Sell Fry     │
│   Maintenance Service                                           │
│                                                                  │
│   (User interventions that modify resources)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### State Management
- **Immutable state** - Each tick produces a new state object via Immer
- **Core systems emit effects** - Effects are collected and applied via `applyEffects()` with clamping
- **Equipment and actions mutate directly** - Use Immer's `produce()` for immutable updates
- Enables undo, replay, and time-travel debugging

### Volume-Scaled Dynamics
- Larger tanks are more stable (realistic behavior)
- Equilibrium speed, evaporation rate, and temperature drift scale with volume
- Smaller tanks experience faster parameter swings

### Water Volume & Concentrations
- Evaporation concentrates pollutants (removes water, not solutes)
- Water changes dilute proportionally
- **Effective volume** - Concentrations use current water level, not tank capacity
- The Dilution core system handles all concentration math

### Bacterial Dynamics
- Bacteria (AOB, NOB) grow to fill available surface area
- Die if insufficient waste (ammonia/nitrite) to sustain them
- Immediately reduced when surface area is reduced (cleaning)
- Surface is provided by: filter media, substrate, hardscape, glass

### Flow Mechanics
- Flow affects gas exchange rate
- More flow = faster O2/CO2 equilibrium with atmosphere
- High flow is also a stressor for fish

### Light & Photoperiod
- Each light fixture has its own on/off schedule
- Photoperiod affects plant growth and algae

### Simplified Chemistry
- **In scope:** pH, ammonia, nitrite, nitrate
- **Out of scope:** GH/KH (hardness), chlorine, TDS
- Single aggregate "nutrients" resource (no NPK/micro split)

### Algae
- Treated as a population (entity), not a resource — see
  `6-PLANTS.md` § Algae as an organism for the full model
- Mass-only state (no condition); net rate from stressors / benefits
  drives mass directly
- Does not compete for surface area (bacteria only)

## Tick Processing Pipeline

Each simulation tick (1 hour) executes in this order:

### 1. Calculate Passive Resources
Aggregate values from equipment used throughout the tick:
- **Surface** - Tank glass + filter media + substrate + hardscape (cm²)
- **Flow** - Filter + powerhead circulation (L/h)
- **Light** - Current light intensity based on schedule (watts)

### 2. Tier: IMMEDIATE
Run environmental systems (emit effects):
- **Temperature Drift** - Newton's cooling toward room temp
- **Evaporation** - Water loss (reduced by lid)

*→ Commit IMMEDIATE effects to resources*

### 3. Process Equipment
Equipment responds to updated state (direct mutations):
- **Heater** - Activates if temp < setpoint
- **Chiller** - Activates if temp > setpoint
- **ATO** - Restores water level if < 99%

### 4. Tier: ACTIVE
Run organism systems (emit effects):
- **Plants** - Photosynthesis (if lights on), respiration
- **Livestock** - Metabolism, feeding, reproduction

*→ Commit ACTIVE effects to resources*

### 5. Tier: PASSIVE
Run chemical/biological systems (emit effects):
- **Decay** - Food/waste → ammonia (temperature-dependent)
- **Nitrogen Cycle** - Ammonia → nitrite → nitrate
- **Gas Exchange** - O2/CO2 equilibrium with atmosphere
- **Dilution** - Concentration adjustments for volume changes

*→ Commit PASSIVE effects to resources*

### 6. Check Alerts
Evaluate alert conditions and track threshold crossings

### 7. Add Log Entries
Append all events to simulation log

**Note:** User actions (Feed, Top Off, Water Change, etc.) are applied **outside** the tick loop as immediate state mutations before the tick begins.

## Logging and Alerts

The simulation logs all significant events and monitors critical conditions. Alerts detect threshold crossings (e.g., low water level) and issue warnings. See `9-LOGGING-AND-ALERTS.md` for details.

## Document Index

| File | Content |
|------|---------|
| 2-ENVIRONMENT.md | External factors affecting the tank |
| 3-EQUIPMENT.md | Tank hardware and their effects |
| 4-CORE-SYSTEMS.md | Biological and physical processes |
| 5-RESOURCES.md | Resource catalog with types and units |
| 6-PLANTS.md | Plant photosynthesis and growth |
| 7-LIVESTOCK.md | Fish, colonies, metabolism, health |
| 8-ACTIONS.md | User interventions |
| 9-LOGGING-AND-ALERTS.md | Event logging and alert system |

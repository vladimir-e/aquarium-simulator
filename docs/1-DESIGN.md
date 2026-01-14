# Aquarium Simulator - System Design

## Overview

A comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment. The simulation tracks resources flowing between components: environment, equipment, core biological/physical systems, plants, livestock, and user actions.

## Design Principles

- **Accurate simulation** - Physics and biology should be realistic
- **Clean architecture** - Elegant solutions over immediate wins
- **Extensibility** - Simple and clean but open for expansion

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
│   Light, Flow, Surface, Food, Waste, Nutrients, Algae           │
│   Bacteria (AOB, NOB)                                           │
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
- Treated as a resource (quantity) not an entity
- Accumulates/depletes based on light, nutrients, competition with plants
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

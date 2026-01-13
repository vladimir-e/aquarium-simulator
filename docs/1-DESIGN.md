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

Components emit **effects** - simple data objects describing resource changes:

```typescript
{ tier: 'active', resource: 'food', delta: -2, source: 'fish' }
```

Effects are processed in **three tiers** with commits between each:

| Tier | Examples | Description |
|------|----------|-------------|
| **IMMEDIATE** | Environment, equipment, user actions | Temperature drift, evaporation, then heater responds |
| **ACTIVE** | Living processes | Fish eat, plants photosynthesize |
| **PASSIVE** | Chemical/biological processes | Decay, nitrogen cycle, gas exchange |

Each tick:
1. Collect IMMEDIATE effects → commit to resources
2. Collect ACTIVE effects → commit to resources
3. Collect PASSIVE effects → commit to resources

This ordering ensures environmental effects (drift, evaporation) happen first, equipment responds to the updated state, organisms react, and finally chemical transformations occur.

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
- **Immutable state** - Each tick produces a new state object
- **Centralized mutation** - Plugins only emit effects, never mutate state directly
- One `applyEffects()` function handles all resource mutations with clamping
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

## Tick Update Order

Each simulation tick (1 hour) processes effects in three tiers:

### Tier 1: IMMEDIATE
- **Temperature** - Drift toward room temp
- **Evaporation** - Water loss
- **Equipment** - Heater, chiller, lights, CO2, ATO (responds to drift)
- **User Actions** - Feed, water change, dose, etc.

*→ Commit IMMEDIATE effects to resources*

### Tier 2: ACTIVE
- **Plants** - Photosynthesis (if lights on), respiration
- **Livestock** - Metabolism, feeding, reproduction

*→ Commit ACTIVE effects to resources*

### Tier 3: PASSIVE
- **Decay** - Food/waste → ammonia
- **Nitrogen Cycle** - Ammonia → nitrite → nitrate
- **Gas Exchange** - O2/CO2 equilibrium
- **Dilution** - Concentration adjustments

*→ Commit PASSIVE effects to resources*

## Event Logging

The simulation logs all significant events to help users understand ecosystem dynamics and for debugging. See `9-LOGGING.md` for details.

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
| 9-LOGGING.md | Event logging system |

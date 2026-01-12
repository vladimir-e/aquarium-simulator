# Environment

External factors that affect the aquarium from outside the tank.

## Purpose

The Environment represents conditions in the room/house where the aquarium is located. These are inputs to the simulation that the user can configure but the tank cannot directly control.

## Parameters

### Room Temperature

| Property | Description |
|----------|-------------|
| **Type** | Continuous (float) |
| **Unit** | Degrees Celsius (°C), 1 decimal precision (e.g., 23.5°C) |
| **Typical range** | 18.0-28.0°C |
| **Role** | Baseline for tank temperature equilibrium |

**Note:** Single decimal precision enables accurate Fahrenheit conversion.

**Behavior:**
- Tank water temperature tends toward room temperature over time
- Heater/chiller fight against this tendency
- Affects evaporation rate (higher temp = faster evaporation)
- Affects gas exchange rates

### Tap Water pH

| Property | Description |
|----------|-------------|
| **Type** | Continuous (float) |
| **Unit** | pH scale (0-14) |
| **Typical range** | 6.5-8.5 |
| **Role** | pH of water added during top-off and water changes |

**Behavior:**
- Water changes and top-offs introduce water at this pH
- Mixed with existing tank water
- Affects final tank pH based on volume ratios

### Ambient Waste

| Property | Description |
|----------|-------------|
| **Type** | Constant (float) |
| **Unit** | Grams per tick |
| **Value** | Very low (e.g., 0.001g/tick) |
| **Role** | Seeds bacteria during fishless cycling |

**Behavior:**
- Constant, very low rate of organic matter entering tank
- Primary purpose: allows bacteria to establish over time without fish
- Simulates dust, airborne organic particles
- Feeds into the Decay system → produces ammonia → feeds bacteria

### Ambient Oxygen

| Property | Description |
|----------|-------------|
| **Type** | Continuous (float) |
| **Unit** | mg/L (at atmospheric equilibrium) |
| **Typical range** | ~8 mg/L at sea level, 20°C |
| **Role** | Oxygen saturation target for gas exchange |

**Behavior:**
- Tank O2 equilibrates toward this value via gas exchange
- Flow rate affects equilibration speed
- Temperature affects saturation capacity

## Interactions

| Environment Parameter | Affects | Via |
|----------------------|---------|-----|
| Room Temperature | Tank temperature | Temperature core system |
| Room Temperature | Evaporation rate | Evaporation core system |
| Room Temperature | Gas exchange | Gas exchange core system |
| Tap Water pH | Tank pH | Water change/top-off actions |
| Ambient Waste | Tank waste | Decay core system |
| Ambient Oxygen | Tank O2 | Gas exchange core system |

## Configuration

All environment parameters are **dynamic** - user can modify them at any time during simulation. This allows modeling:
- Seasonal temperature changes
- Moving the tank to a different room
- Changes in tap water source

## Thresholds

| Parameter | Threshold | Effect |
|-----------|-----------|--------|
| Room Temperature | < 15°C | Heater may not keep up |
| Room Temperature | > 32°C | Chiller may not keep up |
| Tap Water pH | < 6.0 or > 8.5 | Stress during water changes |

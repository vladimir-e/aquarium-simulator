# Plants

Aquatic plants that perform photosynthesis and growth, consuming resources and producing oxygen.

> Plant condition runs on the unified vitality engine. See
> `1-DESIGN.md` § The Vitality Engine for the shared math; this doc
> covers plant-specific stressors, benefits, and the surplus-driven
> growth path.

## Purpose

Plants in the simulation:
- Consume CO2, light, nutrients, and nitrate
- Produce oxygen through photosynthesis
- Suppress algae (thriving plants stress algae via plant-power; struggling plants stop suppressing it)
- Provide shelter (reduce fish stress)
- Help maintain water quality

## Plant Model

Plants are modeled as **individual specimens**, each with their own species characteristics and size.

### Key Concepts

1. **Photosynthesis** emits resource effects (O2 production, CO2 and
   nutrient uptake). It does NOT directly produce plant size — that
   flows through the surplus supply chain.
2. **Vitality** banks per-plant **surplus** on `Plant.surplus` out of
   whatever income upkeep and damage left, at any condition (saturating
   at `surplusCap`); the same bank pays the upkeep and buffers damage
   before condition falls.
3. **Growth** withdraws a share of the bank each lit tick and spends it
   on condition first and size second, the size scaled by species growth
   rate and an asymptotic factor against species `maxSize`. Only what
   repaired or became size leaves the bank.
4. Plants can grow past 100% up to their species `maxSize`; growth
   slows asymptotically as size approaches the cap.

---

## Individual Plant Properties

| Property | Description |
|----------|-------------|
| **Species** | Determines characteristics and requirements |
| **Size** | Current size as % (can exceed 100%) |
| **Condition** | Health state 0-100% (affects growth and survival) |
| **Surplus** | Banked photosynthate, the reserve above condition. A plant goes in holding half of `surplusCap` — a specimen arrives with stores, and one starting empty would read as fully starving on its first tick |
| **Substrate Requirement** | None, Sand, or Aqua Soil |

### Species Characteristics

Each species has different requirements:

| Characteristic | Description |
|----------------|-------------|
| Tolerable Light | PAR band at the substrate; also sets where the species saturates |
| CO2 Requirement | Low / Medium / High |
| Growth Rate | How fast the species grows |
| Substrate Requirement | None / Sand / Aqua Soil |
| Nutrient Demand | Low / Medium / High |

**Light Tier (low / medium / high)** is a *display* label, not a stored field.
The build UI derives it from where a species' tolerable band opens, against the
hobby's published bands — low under 15 PAR, medium 15–25, high 25 and up. It
reads the band rather than `Ik` so that a recalibration of
`saturationIrradianceFactor` cannot move a rendered tier.

**Nutrient Demand Levels:**
- **Low**: Can survive on nitrate alone (from nitrogen cycle). K, Fe, PO4 boost growth but aren't required. Examples: Java Fern, Anubias
- **Medium**: Needs some supplementation. Struggles without phosphate. Examples: Amazon Sword
- **High**: Requires full nutrient supplementation (all 4 nutrients). Dies without dosing. Examples: Dwarf Hairgrass, Monte Carlo

**Substrate Compatibility:**
- Plants with no substrate requirement: float or attach to hardscape
- Plants requiring Sand: can be planted in Sand or Aqua Soil
- Plants requiring Aqua Soil: can only be planted in Aqua Soil

---

## Photosynthesis

The process of converting light energy, CO2, and nutrients into biomass and oxygen.

### Inputs

| Resource | Role |
|----------|------|
| Light | Energy source (PAR at the substrate, µmol/m²/s) |
| CO2 | Carbon source |
| Nitrate (NO3) | Nitrogen source |
| Phosphate (PO4) | Macronutrient |
| Potassium (K) | Macronutrient |
| Iron (Fe) | Micronutrient |

### Outputs

| Resource | Destination |
|----------|-------------|
| Oxygen | Dissolved O2 in water |
| Biomass | Aggregate pool for plant growth |

### Behavior

Photosynthesis only occurs when light is on (photoperiod).

```
photosynthesis_rate = base_rate * light_factor * co2_factor * nutrient_sufficiency
```

**Light factor (photosynthesis–irradiance curve):**

Rate scales with PAR on a saturating curve, evaluated **per plant** against its
own species' saturating irradiance:

```
light_factor = tanh(light_par / Ik)
Ik           = saturationIrradianceFactor * species.tolerableLight[0]
```

This is the Jassby–Platt curve the literature fits to leaves. `Ik` is the
saturating irradiance: below it the response is close to linear, at it the plant
already runs at 76 % of maximum, and above it the curve flattens hard — twice
the fixture stops meaning twice the growth. At the default factor of 2.0 the
roster reads anubias 16, java fern 20, amazon sword 40, dwarf hairgrass 50,
monte carlo 60 PAR.

`Ik` is derived rather than declared: a species' saturating irradiance is a
fixed multiple of the PAR its band opens at, so one number carries both light
channels and no separate species field is needed. At the shipped factor that
puts the bottom of a band at `tanh(0.5)` — a plant scraping its lower bound
runs at **46 %** of its rate while the light-insufficient stressor charges it.

It is not Monod, though the shapes rhyme. Monod exists to stop a *stock* being
overdrawn: demand falls with supply, so the pool approaches zero instead of
crossing it. Light is not a stock — nothing depletes photons and no rate can
overdraw an intensity — so the curve is taken from the leaf rather than from the
pool, and the leaf's own is the one the literature fits. Its shoulder is sharper
than the rectangular hyperbola's, whose tail goes on paying for more light
forever.

**More light never lowers the rate.** There is no photoinhibition term here;
excess PAR is the *light excessive* stressor's job (see § Stressor coverage).
Two channels for one observation would double-count.

**Nutrient Sufficiency (Liebig's Law):**

Plants check all four nutrients against their demand level. The most limiting nutrient determines overall sufficiency:

```
# Each nutrient checked against species demand
demand_multiplier = { low: 0.3, medium: 0.6, high: 1.0 }
threshold = optimal_ppm * demand_multiplier[species.nutrient_demand]

nitrate_factor = min(1, nitrate_ppm / threshold)
phosphate_factor = min(1, phosphate_ppm / threshold)
potassium_factor = min(1, potassium_ppm / threshold)
iron_factor = min(1, iron_ppm / threshold)

nutrient_sufficiency = min(nitrate_factor, phosphate_factor, potassium_factor, iron_factor)
actual_rate = potential_rate * nutrient_sufficiency
```

**Low-demand plants** need only ~30% of optimal nutrients - achievable with nitrate from fish waste alone.

### Nutrient Consumption

Plants consume nutrients proportionally to the fertilizer formula ratio. This prevents individual nutrients from accumulating while others deplete:

```
# Fertilizer ratio (per ml): NO3:PO4:K:Fe = 5:0.5:2:0.1
# Plants consume in this same ratio
consumption = growth_rate * plant_size
nitrate_consumed = consumption * (5 / total_ratio)
phosphate_consumed = consumption * (0.5 / total_ratio)
potassium_consumed = consumption * (2 / total_ratio)
iron_consumed = consumption * (0.1 / total_ratio)
```

### Carbon and Oxygen

Photosynthesis fixes carbon and releases oxygen; the two are one reaction, so
only the carbon is a free parameter. The draw is clamped to the carbon actually
dissolved, and the oxygen comes off what was fixed — a carbon-starved tank stops
producing oxygen because there was no carbon to pay for it.

```
co2_fixed_mg = min(actual_rate * co2_per_rate_unit, co2_mg_per_l * water_volume)
o2_released_mg = co2_fixed_mg * MW_O2 / MW_CO2          # 6CO2 → 6O2, 1:1 in moles
```

Both are **masses**, like the nutrient draws beside them. The resource layer
divides by the tank's water volume to reach the mg/L the gases are stored as, so
the same planting moves a nano further than it moves a 300 L.

---

## Growth and Size

Growth is **surplus-driven**, per plant, no cross-plant sharing. The
pipeline is:

1. Vitality returns the new `Plant.surplus` bank each tick. Whatever
   income upkeep and damage left accrues into it at any condition (up to
   `surplusCap`); a deficit drains it before condition falls (see
   § Plant Condition).
2. Accrual is **photoperiod-gated** (`accrueSurplus: light > 0`): at
   night the overflow is discarded. Plant surplus represents stored
   photosynthate (glucose reserves from carbon fixation); plants need
   active photosynthesis to fix carbon, so without light there's no
   energy actually captured. The gate is belt and braces — every benefit
   is multiplied by the light term, so a dark tick has no overflow to
   discard in the first place. (Vitality itself runs every tick: at
   night the reserve buffers the maintenance the plant is still paying,
   and the cap clamp still applies.)
3. While the photoperiod is active, the plant mobilises
   `growthDrawRate` of the bank — but never past the survival rations —
   and pays condition first and new tissue second, the asymptotic factor
   deciding how much of what is left becomes size:

   ```
   mobilised = min(max(0, surplus − reserved), surplus × growthDrawRate)
   repaired  = min(mobilised, 100 − condition)
   converted = (mobilised − repaired) × asymptoticFactor
   asymptoticFactor = max(0, 1 − size / species.maxSize)
   size_gain = converted × speciesGrowthRate × sizePerSurplus
   ```

   `reserved` is the same line damage stops at (§ Vitality math), and
   both rungs of the ladder are junior to upkeep for the same reason:
   a plant that could repair out of its rations would hand back the
   condition damage just took and starve an hour later.

   Growth pauses at night for the same biological reason: overnight
   respiration burns sugars for maintenance, but net biomass
   accumulation requires active carbon fixation. The bank doesn't
   convert in the dark.
4. **`repaired + converted` is the whole withdrawal** — the bank pays
   for the condition and the growth delivered and nothing else. What
   the ladder couldn't use stays banked. The bank is the canonical
   lifecycle-outcome stock for plants.

So a plant at its ceiling converts nothing, pays nothing, and banks
every unit it earns; a plant with room converts a share and banks the
rest.

The draw is a *share* of the bank rather than a flat per-tick ceiling
so that a plant still growing carries a reserve at all. Either shape
fills the bank of a plant with nowhere left to grow — the asymptotic
factor is zero there, so nothing is withdrawn either way. They part on
the plant that is still growing. Under a flat ceiling the bank settles
wherever the withdrawal matches the income: about half a surplus unit
of the 50-unit cap, which is no reserve. Under a share it settles at
`(income − maintenance) / (growthDrawRate × asymptoticFactor)`, which is
proportional to what the plant clears — 9 to 26 units for a young plant
across the roster under the shipped fixture, a shade species holding
more than a carpet because the same PAR is nearer its saturation. That
reserve is what meets damage before condition falls, and what tells a
fed plant from a starving one.

Note what it is *not*: a growing plant does not settle at `surplusCap`,
and cannot. A day's withdrawal at the cap is more than a day's income,
so the cap is reachable only once the asymptotic factor has closed the
withdrawal down. Anything reading the bank as a fraction of health has
to be scaled against the settling point, not against the cap — which is
why `upkeepReserveHours` is quoted as a duration rather than as a share
of the cap. The line is `maintenance × (1 − hardiness) ×
upkeepReserveHours` in banked units: the same number of hours for every
species, a different stock for each, because the bank *empties* at the
post-hardiness rate.

A share saturates too, at `surplusCap × growthDrawRate` — 1.0 units an
hour on the shipped numbers. A plant reaches it when its settling point
passes the cap, which takes most of its growth curve. Past that the bank
pegs at `surplusCap` and the withdrawal is
`surplusCap × growthDrawRate × asymptoticFactor`, with the income
dropped out of it: size is what slows growth from there, not conditions.
Below the peg the reverse holds — the withdrawal tracks the income and
the plant's size does not enter, so growth over the first part of its
life is roughly linear rather than asymptotic.

The bank at the peg is a bank at the peg *at dusk*. Income arrives only
in the lit hours and maintenance is charged in all of them, so even a
saturated plant gives back the night's maintenance and earns it again
the next morning.

Photosynthesis is decoupled from growth: it emits resource effects
only (O2, CO2, nutrient uptake). Plant size never gets photosynthesis
output directly — it only gets surplus, and surplus is gated by
vitality (which is gated by stressors, including the nutrient-
deficiency stressor that photosynthesis health drives upstream). No
double-counting, no parallel mechanism — a single source of truth for
each plant's per-tick growth.

---

## Respiration (24/7)

Plants respire continuously, consuming oxygen and producing CO2.

### Day (Lights On)
- Photosynthesis usually > Respiration
- Net O2 PRODUCTION
- Net CO2 CONSUMPTION

### Night (Lights Off)
- Only respiration
- Net O2 CONSUMPTION
- Net CO2 PRODUCTION

"Usually" because the day side is the one that reads light. Respiration
runs at 15 % of the light-saturated rate *at the carbon a tank without an
injector carries* — a fifth of `base_photosynthesis`, which is the rate at
`optimal_co2` — so a planting under a fixture too dim to clear that
respires more than it fixes and consumes oxygen with the lamps on. With
carbon at optimum and nutrients past every species' demand, the crossover
sits at 0.57 PAR for a java fern (`Ik` 20) and 1.69 PAR for a monte carlo
(`Ik` 60) — a shade plant stays in credit in light a carpet starves in.
Liebig sufficiency scales the same rate, so it moves the line too: at plain
optimal nutrients, which feed a low-demand plant and starve a high-demand
one, the java fern is unchanged and the monte carlo needs 2.54 PAR. A
carbon-stripped column does the same thing through `co2_factor`.

Over a whole day the two sides are what decide whether a planting is worth
having: a tank on ambient carbon produces 1.9–3.5× what its plants burn in
24 hours, and an injected one 8×. That surplus is why a planted tank
supports more fish than a bare one.

Respiration is photosynthesis run backwards, so it runs on the same
`co2_per_rate_unit`: the carbon released decides the oxygen burnt, at the same
molar ratio. The day/night asymmetry is `base_respiration` — not a second,
disagreeing coefficient.

The rate also saturates against the oxygen there is to burn, on the Monod curve
every aerobic process in the engine uses (see `4-CORE-SYSTEMS.md` §
Oxygen-limited processes). Submerged tissue takes its oxygen out of the water
across a boundary layer, so a plant in a suffocating tank respires slower — and
releases proportionally less carbon, because the carbon is derived from the
oxygen.

```
respiration_rate = base_respiration * temperature_factor * oxygen_factor
                   * total_plant_size
co2_released_mg = respiration_rate * co2_per_rate_unit
o2_burnt_mg = co2_released_mg * MW_O2 / MW_CO2

if lights_on:
    O2_change = photosynthesis_O2 - respiration_O2  # positive
    CO2_change = respiration_CO2 - photosynthesis_CO2  # negative
else:
    O2_change = -respiration_O2  # negative
    CO2_change = +respiration_CO2  # positive
```

### The overnight sag

A planted tank's dissolved oxygen peaks at lights-out and troughs at first
light. The engine's grown-in, carbon-injected 150 L falls **2.17 mg/L** across
its dark hours, inside the 1–3 mg/L a real planted aquarium shows;
`tests/planted-gas-budget.test.ts` anchors it there.

**The planting is not most of that fall, and it cannot move it.** Booked by
source over the anchor tank's nights:

| gas exchange to the surface | plant respiration | decay | nitrification | fish |
|---|---|---|---|---|
| 50 % | 23 % | 10 % | 11 % | 6 % |

Half the night leaves across the surface, because what the water sheds after
dark is the supersaturation the day built relaxing back toward saturation. That
also makes the fall insensitive to everything inside the tank: taking
`base_respiration` from the shipped rate to exactly zero moves it 1.3 %, since
oxygen a plant does not burn is oxygen the surface sheds instead at a higher
gradient. Every sink in the tank is buffered against every other by the same
first-order exchange.

So the sag is a **day-side quantity**: it runs at 3.3× gross photosynthesis
across the whole calibrated range of `co2_per_rate_unit`, and the dawn trough
does not move with the yield at all — 96–97 % of saturation throughout. The tank
comes back to the same water every morning whatever it did with its day. A tank
that *stops* sagging has stopped building a day, not stopped spending a night:
the same 150 L with no planting in it does not sag at all.

---

## Plant Condition (Vitality)

Each plant has a **condition** (0-100%) driven by the unified
**vitality engine** that fish also use. Each tick, the engine builds
two lists for the plant — damage factors (stressors) and benefit
factors — and produces:

1. The plant's new condition (clamped 0–100), and
2. The new **surplus** bank — fills from overflow at condition 100,
   drains to buffer damage before condition falls (see *Vitality math*).

The locked design rule: **growth happens only when condition is 100**.
A stressed plant heals first, then grows. It never crawls forward at
reduced rate. Surplus is the gate for biomass distribution
(see *Growth and Size* below). The bank also protects condition: a
plant with reserves holds condition through a hostile tick while its
buffer drains, so **condition 100 with negative net means burning
reserves, not thriving** — the plant reads full while its bank bleeds.

### Stressor coverage

Each species' tolerance bands (`tolerableLight` in PAR at the substrate,
`tolerableCO2`, `tolerableTemp`, `tolerablePH`) define when a stressor
activates:

| Stressor | Trigger | Severity (per unit deviation) |
|----------|---------|-------------------------------|
| Light insufficient | `light < tolerableLight[0]` *and* lights on | `lightInsufficientSeverity` × gap |
| Light excessive | `light > tolerableLight[1]` | `lightExcessiveSeverity` × gap |
| CO2 insufficient | `co2 < tolerableCO2[0]` *and* lights on | `co2InsufficientSeverity` × gap |
| Temperature out of range | outside `tolerableTemp` | `temperatureStressSeverity` × gap |
| pH out of range | outside `tolerablePH` | `phStressSeverity` × gap |
| Nutrient deficiency | Liebig sufficiency < 1 | `nutrientDeficiencySeverity` × (1 − sufficiency) |
| Nutrient toxicity | NO3 ppm > `nutrientToxicityThresholdNitrate` (default 100) | `nutrientToxicitySeverity` × ppm above threshold |
| Algae shading | algae > `algaeShadingThreshold` | `algaeShadingSeverity` × algae above threshold |

CO2 and light-low stressors are gated on `light > 0` (lights on) — at
night the plant is dormant and doesn't suffer from low CO2 or low
light. Light excess remains active any time the lamps are bright
enough to burn leaves.

**Upkeep is not on that table, and that is the point.** It is charged
every hour at `upkeepCost × q10(temperature)`, but against income rather
than against condition: it is what the plant owes for being alive, and
an hour it cannot pay costs it tissue, not health. The two ledgers are
set out below (§ Vitality math). The plant cards merge them into one
list for display, which is a rendering choice and not a claim about
where the cost lands.

**Upkeep is also the compensation point.** It runs on the same Q10 the
gas layer's respiration does, so the two layers describe one plant and a
warm blackout kills faster than a cool one. Its reference is the
irradiance where photosynthesis pays for respiration, 10–20 % of
saturating irradiance in the macrophyte literature: `upkeepCost`
against the benefit budget puts a hardiness-0.3 species at 10.5 % of its
own `Ik`, and hardiness carries the shade species below that. Dim light
is not free — below that PAR a plant runs a deficit however perfect the
water is.

There is no separate starvation severity. Once an unpaid bill drives
shedding directly, the acceleration is the feedback loop — bank drains,
more of the bill goes unpaid, more tissue goes — rather than a constant
tuned to imitate one. A multiple on top of maintenance was measured
against a blackout and moved the death day by one in forty either way,
so it went.

Night and darkness cost the same per hour. What differs is whether the
bank ever refills — so the bank tells them apart without the light
stressors having to know which is which. A plant at night is respiring
on reserve; a plant in a week-long blackout is starving, and pays in
tissue.

**Nutrient deficiency is pinned from both ends**, which is the rule for
every plant severity from here on: a marginal shortfall is *outlived* and
a severe one kills on a timescale a keeper would recognise. At the
shipped 0.3, water with no nitrogen in it at all melts a monte carlo in
28 days, while the shipped `planted` and `betta` presets — undosed,
planted with the java fern and anubias every beginner guide names — hold
all five plants alive at condition 96–100 for 180 days.

Damage rates are pre-hardiness; the species `hardiness` (0–1)
multiplier is applied centrally inside the vitality engine (`damage *
(1 - hardiness)`). A high-hardiness species (Anubias 0.75) takes
quarter the damage of a low-hardiness one (Monte Carlo 0.3) under the
same stressor.

### Benefit coverage

Benefits stack into a positive recovery rate; at saturating light in a
fully-comfortable tank they sum to roughly 0.5 %/h. Each is awarded on
its own channel — a tolerance band for CO2, temperature and pH, Liebig
sufficiency for nutrients — and every one of them is then multiplied by
the light term, which is the saturating PAR curve photosynthesis runs
on.

| Benefit | Trigger | Magnitude |
|---------|---------|-----------|
| CO2 | inside `tolerableCO2` | `co2BenefitPeak × tanh(light / Ik)` |
| Temperature | inside `tolerableTemp` | `temperatureBenefitPeak × tanh(light / Ik)` |
| pH | inside `tolerablePH` | `phBenefitPeak × tanh(light / Ik)` |
| Nutrients | sufficiency × peak | `nutrientBenefitPeak × sufficiency × tanh(light / Ik)` |

**The budget is income, not comfort.** A plant realises every one of
those channels *through* photosynthesis: good carbon and warm water are
worth nothing at midnight. So light is not one input among five, it is
the term the other four modulate — a plant at 80 PAR earns more than one
at 20, and one in the dark earns nothing at all. The curve reaches its
peak only asymptotically, so a species deep in its band is still earning
more for every extra photon.

The two light channels stay separate at the top of the band: crossing
`tolerableLight[1]` costs a plant damage through the excess stressor,
not its income. Earnings are continuous across that boundary.

Income arrives only in the lit hours while every stressor is charged in
all 24, so the balance a plant lives on is a daily one and the
photoperiod is a real lever. The PAR that holds a plant across a whole
day is 1.5–2.3 × its instantaneous compensation point on the shipped
10 h schedule, the shade species at the top of that range.

Benefits are **not** scaled by hardiness — a hardy plant tolerates
poor conditions better, but isn't more energised by good ones.

### Vitality math (per tick)

A plant runs two ledgers, and which one a deficit belongs to decides
which stock it reaches. Energy — income against the cost of living —
ends in the bank and then in `size`. Health — damage done *to* the
plant — ends in `condition`.

```
upkeepRate  = Σ upkeep.amount   × (1 - hardiness)
damageRate  = Σ stressor.amount × (1 - hardiness)
benefitRate = Σ benefit.amount
bank        = clamp(plant.surplus, 0, surplusCap)   // self-heals old saves
reserved    = upkeepRate × upkeepReserveHours       // survival rations

energyNet   = benefitRate − upkeepRate
if energyNet < 0:   drain   = min(bank, |energyNet|)          // to the last unit
                    bank   −= drain
                    starved = (|energyNet| − drain) / upkeepRate   // → shedding

conditionNet = max(0, energyNet) − damageRate
if conditionNet < 0:  buffered = min(max(0, bank − reserved), |conditionNet|)
                      bank    −= buffered
                      newCondition = max(0, condition + conditionNet + buffered)
if conditionNet > 0:  newCondition = condition
                      bank = accrue ? min(surplusCap, bank + conditionNet) : bank
```

`accrue` is the photoperiod gate (`light > 0`); draining and the cap
clamp apply regardless.

Three consequences worth internalising:

- **One bank, two claims, in an order.** Upkeep is senior and may spend
  the reserve to the last unit; damage may only spend what stands above
  `upkeepReserveHours` of upkeep. Separating them instead was tried and
  measured: it deletes the burning-reserves reading. Letting damage
  spend to the floor was tried too, and it turns any nagging channel
  into starvation — damage outweighs upkeep by an order of magnitude, so
  the bank damage empties is the bank the next dark hour finds empty. A
  fortnight without fertiliser kills both carpets without the line and
  neither with it.
- **Nothing here repairs condition.** Repair is a *withdrawal*, made by
  `spendSurplus` alongside growth and ahead of it — the same heal-then-
  grow ladder, with the bank as the pool both rungs draw from. A bank
  unit is a condition point; the bank accrued out of the same %/h the
  deficit is measured in. Both rungs stop where damage stops: the
  withdrawal comes out of `max(0, bank − reserved)`, so the line holds
  for more than the tick that drew it.
- **Damage is met out of income first, then out of the spare.** A
  nagging channel costs a plant its banking rate — which is to say its
  growth — before it costs any reserve, and its reserve before it costs
  any condition.

Fish and algae owe no upkeep, so `energyNet` is their whole income
and the shape collapses back to the single balance they always ran:
income repairs them on the spot, damage drains the bank before condition
falls with nothing reserved against it, and the bank fills only from
what a full condition leaves over.

### Heal-or-decline trajectory

There is no intermediate steady state for plant condition: any organism
whose net rate is non-negative heals to 100, and any organism whose
net rate is negative declines toward 0. A plant whose income covers
maintenance will reach 100 even when its conditions are merely
"adequate" — there is no homeostatic parking. This is the same
trajectory shape used for fish.

For a plant the balance is a daily one, because maintenance never stops
and income only arrives with the light. A plant reads as parked at a
condition only while its reserve is absorbing the shortfall: **condition
100 with a draining bank is a plant on its way down**, and the bank is
where to look for it.

---

## Shedding and Death

A plant that cannot pay for itself sheds tissue, and one that runs out
of either stock leaves the tank.

### Shedding

Shedding is the outlet for an unpayable upkeep bill — not a state a
condition threshold switches on:

```
starved   = share of upkeepRate the income and the bank both failed to cover
size_lost = size * starved * maxSheddingRate
size     -= size_lost
tank.waste += size_lost * WASTE_PER_SHED
```

- A plant paying its whole bill sheds nothing, whatever its condition.
- A plant paying none of it sheds `maxSheddingRate` of itself an hour.
- Between the two the rate is the share of the bill left standing, so a
  dim afternoon and a blackout are the same mechanic at two strengths.

**The tissue leaves as waste, not as fuel.** That is what separates
shedding from the growth line it otherwise mirrors: a starving plant
abscises its oldest leaves rather than digesting them, which is why
melting plants foul the water. Measured, the alternative does not work
— routing the shortfall back through `sizePerSurplus` as an energy
conversion costs about a tenth of what growth invested, so a blacked-out
anubias still reads alive at 90 days.

Nothing shrinks a plant for being *damaged*, only for being unfed.
Nitrate burn, wrong pH and shade take condition; measured, letting them
take tissue as well kills an anubias in a nutrient-free tank in 5 days
against 90 on `main`, because the health deficit is five to twenty times
the size of the bill and saturates the shed rate on the first tick.

### Plant Death

A plant dies when:
- **Condition < 10%**, OR
- **Size < 10%**

```
if condition < 10 OR size < 10:
    # Plant dies
    tank.waste += size * WASTE_PER_DEATH
    remove_plant_from_tank()
```

Dead plants add significant waste to the system (decaying biomass).

The two thresholds now name two different deaths. Condition is what
takes a plant that was *damaged* — poisoned, cooked, shaded. Size is
what takes a plant that *starved*: it holds condition 100 the whole way
down and simply runs out of itself.

### Recovery

Plants recover if the tank is put right before either stock runs out:
- Size lost to shedding is permanent — a recovered plant is a smaller
  plant, and grows again from there.
- Repair is a withdrawal from the bank, so a plant recovers as fast as
  its income lets it bank, and never at the cost of the night's upkeep.
- Full recovery to 100 % condition takes time, and growth resumes only
  once repair stops claiming the whole withdrawal.

---

## Algae as an organism

Algae is a peer organism to plants and fish: it lives in
`state.algae` and is processed in the ACTIVE tier of the tick.
Unlike plants and fish, **algae has no condition** — it's a pure
population. Stressors and benefits feed a single signed net rate that
drives the surplus reserve bank and, through it, mass: positive net
accrues surplus and grows the bloom; negative net drains the reserve
before mass shrinks, so a stocked bloom rides out a hostile tick.

This shape previews the colony abstraction (snails, shrimps): a
population doesn't need health, just population dynamics.

### State shape

```ts
state.algae: AlgaeState

interface AlgaeState {
  /** Aggregate biomass / coverage 0–100. */
  mass: number
  /** Reserve bank: buffers hostile ticks, spent on mass growth (capped). */
  surplus: number
}
```

Initialised to `{ mass: 0, surplus: 0 }`.

### Plant power — the shared primitive

Both fish vitality (shelter benefit) and algae vitality (suppression
stressor + low_plant_power benefit) read a single tank-wide number:

```
plantPower = Σ over plants of (plant.size / 100) × (plant.condition / 100)
```

A full-grown thriving plant contributes 1.0; a half-grown plant at
full health contributes 0.5; a sick plant contributes 0. Overgrown
plants count proportionally more — a single size-300 healthy plant
contributes 3.

`getPlantPower` lives in `simulation/systems/plant-power.ts` and is
the only place the formula appears.

### Algae stressors

| Stressor | Trigger | Severity (per unit deviation) |
|----------|---------|-------------------------------|
| Plant suppression | `plantPower > suppressionThreshold` | `plantSuppressionSeverity × (plantPower − threshold)` |

There is intentionally no direct CO2 / temperature / pH / oxygen
stressor on algae. Plant condition is the **meta-signal** — anything
that hurts plants (low CO2, bad pH, ammonia spike) shows up to algae
as falling plant power, which shifts algae from suppressed → fueled.

### Algae benefits

Capped at peak: `min(peak, severity × deviation)`.

| Benefit | Trigger | Magnitude |
|---------|---------|-----------|
| Excess light | `light > lightExcessThreshold` (PAR) | `min(peak, severity × (PAR − threshold))` |
| Excess nutrients | NO3 ppm or PO4 ppm above plant optimum | `min(peak, severity × max(no3Excess, po4Excess))` |
| Nutrient deficiency | NO3 ppm or PO4 ppm below plant optimum | `min(peak, severity × max(no3Def, po4Def))` (small) |
| Low plant power | `plantPower < weaknessThreshold` | `min(peak, severity × (threshold − power))` |

`low_plant_power` and `plant_suppression` are mirror-image factors
with a deadband between `weaknessThreshold` and `suppressionThreshold`
— neither fires inside the band, giving the system a quiet zone.
`excess_nutrients` is the dominant nutrient lever; `nutrient_deficiency`
is the canary signalling "plants are starving, algae moves in" with
intentionally small severity.

### Net rate

Each tick, `computeAlgaePopulation` builds the stressor / benefit
factor lists and reduces them to a signed net:

```
damageRate  = Σ stressor.amount × (1 − hardiness)
benefitRate = Σ benefit.amount
net         = benefitRate − damageRate
```

Hardiness is clamped to `[0, 1]` and scales stressors only. The
factor lists are returned alongside the net rate as a `breakdown`
for UI / telemetry — same shape the plant and fish vitality
engines emit.

### Mass dynamics

The bloom folds `net` into the surplus reserve bank via the shared
`bankSurplus` primitive (the same one fish and plants use), then spends
what's left on mass:

```
bank = clamp(algae.surplus, 0, surplusCap)   // self-heals old saves
if net > 0 and lights on:  bank = min(surplusCap, bank + net)  // accrue
if net < 0:                drain = min(bank, |net|); bank −= drain
                           overflow = |net| − drain             // hits mass
```

**Positive net → surplus → mass growth.** Accrual and growth-spend are
photoperiod-gated (lights on). The tick-spend step drains the bank into
mass with the same asymptotic shape as plant growth:

```
drained      = min(bank, algaeGrowthPerTickCap)
factor       = max(0, 1 − mass / 100)
massIncrease = drained × factor × massPerSurplus
```

The asymptotic factor self-limits at `mass = 100`: surplus keeps
draining at full rate but yields less mass per unit drawn near
saturation.

**Negative net → drain reserve, then shrink mass.** Runs 24/7 (a
suppressed bloom recedes at night too). The reserve absorbs the hit
first; only the shortfall the bank can't cover reduces mass:

```
algae.mass = max(0, algae.mass − overflow)   // overflow = damage past the bank
```

Decayed mass is **lost from the system** — not converted to waste
or nutrients. Same convention as scrubbing.

**Spec invariant**: while `net ≥ 0` and lights are on, mass is
monotonically non-decreasing apart from scrub. The only ways to
remove healthy algae mass are scrubbing (manual) or driving net
negative *for longer than the reserve can absorb* (heavy planting /
rebalanced nutrients / light reduction).

### Tick ordering

Algae runs in the ACTIVE tier, **after plants**, before livestock.
That order matters: algae stressors / benefits read freshly-updated
plant condition through `getPlantPower`. The reverse direction — algae
mass affecting plants via the plant-side `algae_shading` stressor —
is allowed to lag by one tick (algae mass from the previous tick
feeds this tick's plant vitality), an acceptable trade-off for the
ordering required by the suppression feedback loop.

### Algae shading on plants

The plant-side `algae_shading` stressor reads `state.algae.mass` and
fires once mass crosses `algaeShadingThreshold` (default 30). Above
the threshold:

```
algaeShadingDamage = algaeShadingSeverity × (mass − threshold)
```

This is the feedback loop that makes the threshold meaningful: a
mild bloom self-limits via plant suppression, but a heavy bloom
hammers plants into decline, which lifts algae's `plant_suppression`
stressor, which lets algae grow more — the death spiral. Manual
scrubbing is the player's only out once it spirals.

### Configuration

All algae knobs live in `simulation/config/algae-vitality.ts`:
hardiness, the suppression / weakness thresholds, severities and
peaks for each benefit channel, and the surplus-spend shape.
First-pass values aim for **mechanism correctness**, not ecological
accuracy — a recalibration session follows Task 42 and will tune
these against the calibration scenarios.

### Out of scope (deferred)

- Nutrient consumption by algae (algae doesn't draw NO3 / PO4 from
  the pool). If it did, `excess_nutrients` would self-limit
  organically. Adds calibration surface — defer.
- Algae as a fish stressor (covers gills, etc.). Real concern, but
  decline path can wait.
- Multiple algae species (BBA / GSA / hair). Single aggregate is
  fine for now; the new state shape is extensible.
- Mass-decay → waste conversion. Decayed algae just disappears.
- Generic colony / mass-based-organism abstraction. This task makes
  algae the first instance; refactor when a second instance lands
  (snail / shrimp colony).

---

## Competition with Algae

Plants and algae compete for the same resources:
- Light
- CO2
- Nitrate (NO3)
- Phosphate (PO4)

Healthy, fast-growing plants out-compete algae by consuming these shared resources first.

```
# Well-grown plants starve algae
if plants_thriving:
    plantPower_high → algae_plant_suppression_active
    algae_net_negative → mass_shrinks_directly

# Struggling plants = algae opportunity
if excess_nutrients AND poor_plant_health:
    plantPower_low → algae_low_plant_power_benefit
    excess_nutrients_benefit → algae_net_positive → surplus_grows_mass
```

**Key dynamic**: Excess nutrients (especially nitrate and phosphate) combined with light promote algae. The natural defense is healthy plants whose plant-power drives algae's net rate negative — a thriving canopy stops the bloom from banking surplus and shrinks existing mass directly until lights-out or scrub.

---

## Interactions

### Plants Receive From:
| Resource | Source |
|----------|--------|
| Light | Light equipment, attenuated to the substrate |
| CO2 | CO2 system, fish respiration |
| Nitrate | Nitrogen cycle, fertilizer dosing |
| Phosphate | Decay (trace), fertilizer dosing |
| Potassium | Fertilizer dosing only |
| Iron | Fertilizer dosing only |

### Plants Provide To:
| Resource | Destination |
|----------|-------------|
| Oxygen | Tank dissolved O2 |
| Waste | Shedding, death |
| Shelter | Reduces fish stress |

---

## Thresholds

| Condition | Effect |
|-----------|--------|
| Light < minimum | Plants decline, algae may thrive |
| CO2 < 10 ppm | Growth severely limited |
| Nitrate = 0 | Nitrogen deficiency, condition drops |
| Phosphate = 0 | Growth limited (medium/high demand plants suffer) |
| K or Fe = 0 | Growth limited (high demand plants suffer) |
| Nutrient sufficiency < 50% | Condition begins declining |
| Nutrient sufficiency < 20% | Rapid condition decline |
| Upkeep unpaid | Shedding begins, in proportion to the share unpaid |
| Plant condition < 10% | Plant dies |
| Plant size < 10% | Plant dies |

---

## Trimming

When plants are trimmed (Action: Trim Plants):

```
# Trim to target size (e.g., 50%, 85%, 100%)
for each plant:
    if plant.size > target:
        trimmed = plant.size - target
        plant.size = target
        # Trimmed material exits system (not added to waste)
```

After trimming:
- Reduced competition among remaining plants
- Growth rate may increase
- Overgrowth penalties removed

# Darkness had no price: `light-deficiency`

Date: 2026-08-11 · Branch: `light-deficiency` · Register defect #37, low side

Ninety days with a fixture that never came on left every species at condition
100, size unchanged, net **+0.400 %/h**. The engine scored pitch black as
recovery, so a plant at condition 20 healed to full on no light at all.

Two causes, neither a constant. Light was one fifth of a flat additive benefit
budget, so in the dark the other four kept paying 0.4 %/h — income from water
the plant was not using, while the gas layer burned its carbon around the
clock. And nothing charged for staying alive, so there was no compensation
point and no rate for a reserve to drain against.

Every figure below is an engine run driven through `keep()`, the same loop the
anchors run, at `rngSeed` 5. The probe is `npm run probe:dark-tank`: a 40 L on
the shipped fixture (50 PAR, 10 h, landing 38.1 PAR on the substrate), one
plant at size 35, every channel but light rewritten to optimum before each
tick.

---

## The constants

| constant | was | is | note |
|---|---|---|---|
| `lightBenefitPeak` | 0.1 | **gone** | light is the term the others multiply, not a fifth of them |
| `co2BenefitPeak` | 0.1 | **0.125** | four channels now carry the whole ≈ 0.5 %/h budget |
| `temperatureBenefitPeak` | 0.1 | **0.125** | |
| `phBenefitPeak` | 0.1 | **0.125** | |
| `nutrientBenefitPeak` | 0.1 | **0.125** | |
| `maintenanceCost` | — | **0.075** | the compensation point, at 10.5 % of Ik for a hardiness-0.3 species |
| `starvationMultiplier` | — | **1** | ceiling is recovery, and it sits just above 1 |
| `starvationReserveHours` | — | **100** | four days of maintenance is a provisioned bank |

The four peaks moved because the model did. They were the flat share each
channel paid for sitting in range; they are now the peak share each channel
pays *through photosynthesis*, so the sum at saturating light is the same
0.5 %/h the recovery curves were pinned against and the sum in the dark is
zero. Nothing else about them changed, and no other constant moved.

## Income is light

Every one of a plant's benefits is realised through photosynthesis: good carbon
and warm water are worth nothing at midnight. So the four in-band channels
multiply by the same `tanh(PAR / Ik)` photosynthesis already runs on, and light
stops being an additive member of the sum.

This is the part that makes the rest work. With the 0.4 %/h floor in, a bank
never drains in the dark, the starvation term below never engages, and no
maintenance small enough to deserve the name can overcome it — anubias would
need 1.6 %/h pre-hardiness just to reach zero.

## Maintenance, and where it is quoted

`maintenanceCost × getRespirationTemperatureFactor(temp)`, always on, off the
same Q10 the gas layer's respiration uses — so the two layers describe one
plant, and a warm blackout kills faster than a cool one.

Its reference is the compensation point: the irradiance where photosynthesis
pays for respiration, which the macrophyte literature puts at 10–20 % of
saturating irradiance. `0.075 × (1 − 0.3)` is 0.0525, and `0.5 %/h × tanh(0.105)`
is the same number, so a hardiness-0.3 species breaks even at **10.5 % of its
own Ik**. Hardiness is what carries the rest of the roster below that, which is
the direction shade adaptation goes.

Measured, with everything but light at optimum and a provisioned bank:

| species | Ik | band low | net = 0 at | × Ik | holds 90 d above | × Ik |
|---|---|---|---|---|---|---|
| anubias | 16 | 8 | 1.6 | 0.103 | 3.7 | 0.231 |
| java fern | 20 | 10 | 2.7 | 0.136 | 5.6 | 0.281 |
| amazon sword | 40 | 20 | 10.7 | 0.268 | 17.3 | 0.434 |
| dwarf hairgrass | 50 | 25 | 17.1 | 0.342 | 26.6 | 0.531 |
| monte carlo | 60 | 30 | 21.5 | 0.358 | 31.6 | 0.527 |

The two columns differ by the photoperiod. `net = 0` is the hour's own balance;
`holds` is the dimmest fixture a whole day balances under, income arriving for
10 hours and maintenance charged for 24. The fussy species' daily line lands
within a PAR or two of the band low they were given independently — 26.6
against 25, 31.6 against 30 — which is the two halves of the model agreeing.

The species above their own band low read a compensation point above the
literature's 10–20 % because the light-insufficient stressor is in the answer
too: below its band a plant is paying that as well as maintenance.

## Starvation, and the ceiling on it

`maintenance × starvationMultiplier × (1 − provisioned)`, where `provisioned`
is the bank read against `maintenance × starvationReserveHours` — zero
starvation at or above that reserve, the full multiple at an empty bank.

**Two things the task doc did not account for, both measured here.**

*The denominator cannot be `surplusCap`.* Growth withdraws `growthDrawRate` of
the bank every lit hour — about 18 %/day — while the most a plant can earn in a
day is ~5 units. A growing plant therefore settles far below the 50-unit cap:
with starvation switched off entirely, the shipped fixture settles anubias at
25.7, java fern 26.7, sword 18.7, hairgrass 13.8, monte carlo 11.5. A ramp
normalised by the cap charges a *fed* plant half to four fifths of maximum
starvation, so at any multiple that melts a blacked-out plant it also kills
every lit one. Reading the reserve as hours of maintenance instead puts the
"provisioned" line at 7.5 units, below where a fed plant sits and above where a
dark one is heading — and it moves with temperature, so a warm plant needs more
banked reserve to count as fed.

*The multiple is capped by recovery, not by taste.* A plant banks surplus only
at full condition, so an empty bank is a state it has to *heal* out of. Income
arrives in the lit hours and starvation is charged in all of them, so recovery
needs `photoperiod × income > 24 × maintenance × (1 + multiplier)`. Measured on
a monte carlo dropped to condition 50 with an empty bank in the lit control,
29 days later:

| `starvationMultiplier` | condition after 29 d | S02 variant A at 90 d |
|---|---|---|
| 0 | 96 | 3 of 5 plants |
| **1** | **61** | **3 of 5 plants** |
| 1.5 | 43 | 1 of 5 |
| 2 | 26 | 0 of 5 |
| 3 | died | 0 of 5 |

Above ~1.2 the term stops being a mechanic and becomes a landmine: any tank
that goes bad for two days kills every plant in it permanently, however fast
the keeper fixes it. `main` for comparison keeps 3 of 5 in S02 A. The multiple
ships at 1, and `plant-vitality.test.ts` pins the day-balance inequality so a
future move has to notice.

The 20 the task doc proposed was reasoned from the melt time it wanted. At 20 a
lit monte carlo dies on day 8 under a perfect fixture.

## Establishment

`addPlant` and any seeded plant start at half the cap rather than 0. A plant
starting empty reads as fully starving on its first tick and melts on the way
into a perfect tank. A state fact, not a mechanic.

The first week of a fresh planting under the shipped fixture, size/bank:

| species | d1 | d3 | d5 | d7 | condition |
|---|---|---|---|---|---|
| anubias | 35.6/25 | 36.7/24 | 37.8/24 | 38.9/24 | 100 |
| java fern | 35.9/25 | 37.8/24 | 39.6/23 | 41.4/23 | 100 |
| amazon sword | 36.9/23 | 40.2/20 | 43.2/19 | 46.0/17 | 100 |
| dwarf hairgrass | 37.8/22 | 42.5/18 | 46.5/16 | 50.0/14 | 100 |
| monte carlo | 38.3/22 | 43.8/18 | 48.3/14 | 52.1/12 | 100 |

Every species grows from day one. The bank falls over the week for the fast
species because growth is spending it down toward the level its income
supports, which is what the ⅓-of-cap settling points above are.

## What darkness costs now

Ninety days, 40 L, one plant at 35, everything but light at optimum.

| species | lights on | never on | off on day 30 |
|---|---|---|---|
| anubias | 83.4, c100 | c67.5, falling | c90.8, falling |
| java fern | 111.6, c100 | c51.9, falling | c79.3, falling |
| amazon sword | 140.5, c100 | **died d76** | c22.0, falling |
| dwarf hairgrass | 151.1, c100 | **died d56** | **died d74** |
| monte carlo | 149.8, c100 | **died d56** | **died d72** |

No species reads condition 100 or a positive net in the dark at any point — the
final-tick net runs −0.018 (anubias) to −0.051 (monte carlo), against +0.400 on
`main` for every one of them. Three of five reach the death threshold inside 90
days and the other two are on a monotone decline, anubias passing 67 and java
fern 52 by day 90.

The blackout traces show the shape the reserve buys. Monte carlo, lights out on
day 30:

```
  d 30  size   81.4  condition 100.0  bank   8.4
  d 31  size   81.4  condition 100.0  bank   7.2
  d 33  size   81.4  condition 100.0  bank   4.3
  d 35  size   81.4  condition 100.0  bank   0.2
  d 36  size   81.4  condition  97.8  bank   0.0
  d 40  size   81.4  condition  88.1  bank   0.0
```

Five days at condition 100 while the bank goes, then the decline. Anubias
spends 0.45 bank units a day and is still at condition 100 with 19.3 banked ten
days in — the species spread comes out of hardiness and the reserve a fed plant
holds, ~8× across the roster on the blackout run rather than the ~10 % the
register expected from the deficit.

## Photoperiod is a lever, not a cliff

Same fixture, fewer hours, 90 days:

| species | 4 h | 6 h | 8 h | 10 h | 12 h | 16 h |
|---|---|---|---|---|---|---|
| anubias | 52.1 | 62.5 | 72.9 | 83.4 | 93.9 | 115.0 |
| java fern | 61.3 | 77.9 | 94.8 | 111.6 | 128.6 | 162.4 |
| amazon sword | 64.0 | 88.9 | 114.6 | 140.5 | 166.5 | 218.7 |
| dwarf hairgrass | c26.8 | c79.2 | 117.6 | 151.1 | 184.8 | 252.5 |
| monte carlo | died d88 | c54.6 | c97.4 | 149.8 | 185.0 | 255.9 |

Size at 90 d, or the condition it is sitting at if below 100. Eight and twelve
hours both carry every species the shipped fixture suits, twelve banks faster
(monte carlo 8.9 units at 10 h against 10.5 at 12 h), and the shortest
photoperiods are where a carpet under a fixture that is already dim for it
stops being able to pay. That is the trade the model is meant to express: this
fixture lands 38.1 PAR, which is 0.64 of monte carlo's Ik, and the hours are
what is left to make up the difference with.

---

## What this run does not settle

- **A transient deficiency is now a death spiral.** The bank buffers every
  stressor, not only darkness, so anything that empties it — a week of bad
  nutrients, a bloom — brings starvation on. Scenario 02 variant A loses both
  monte carlos on day 69 rather than day 71, and the planting ends 30 % smaller
  (300 against 425 with the income change alone), which lets nitrate climb past
  what the neons tolerate by day 81. `main` keeps them. The plant numbers hold;
  the fish are a second-order consequence of a smaller planting and belong to
  whichever pass re-derives the nutrient severities.
- **`nutrientDeficiencySeverity` is quoted against a band that no longer
  holds.** Its docstring cites scenario 02 variant B — "monte carlo bottoms out
  at 30–55 by day 28 rather than dying". It dies on day 4. That constant was
  not touched here; the scenario doc already flags its bands as pre-vitality,
  and the §9 calibration pass owns it.
- **The multiple is capped by an engine rule, not by biology.** Recovery is
  bounded by "surplus accrues only at condition 100" — a plant healing from
  stress cannot rebuild reserve while it heals. If that rule ever changes, the
  ceiling on `starvationMultiplier` moves with it and this run should be
  re-read.

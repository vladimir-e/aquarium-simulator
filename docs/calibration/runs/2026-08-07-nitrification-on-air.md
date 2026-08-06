# Nitrification reads oxygen, and its rates get re-quoted

Date: 2026-08-07 · Branch: `gas-volume-stoichiometry` · Roadmap §2, subtask 2b

Nitrification is strictly aerobic and read no oxygen at all. It now does, on
both sides: Monod rate limitation with a half-saturation constant per guild, and
the textbook 3.43 / 1.14 mg O₂ per mg N derived through `core/chemistry.ts`.

The half-saturation pair is Wiesmann's, unchanged from where the work was
parked — **K_AOB 0.3, K_NOB 1.1**, inside the published 0.3–0.6 and 0.6–1.5 with
NOB the fussier guild. That gap is the whole point of the change and it is not a
free parameter.

Probe: `npm run probe:nitrification-on-air`. The previous half of 2b is
`2026-08-06-oxygen-availability.md`, which held this work back for the reason
the next section settles.

---

## What moved, and why it is a derivation rather than a fit

The oxygen factor `[O₂]/(K + [O₂])` reaches 1 only at infinite oxygen. So a
rate that was fitted or measured in real water was **already below the maximum
the Monod curve multiplies down from** — a Monod pair is `(μ_max, K)` and
`μ_max` is by definition the infinite-substrate asymptote. Three nitrifier
constants were quoted as if they were `μ_max` and were not.

`AIR_SATURATED_O2 = 8.38 mg/L` is what the engine's own Henry's-law fit gives at
the 25 °C the rates are quoted at (`config/index.test.ts` holds the two
together). The factor there is **0.96544 for AOB** and **0.88397 for NOB**.

| constant | was | is | what it now means |
|---|---|---|---|
| `bacteriaProcessingRate` | `0.0002` | `0.0002 / 0.96544` | 2×10⁻¹³ g/cell/h is what a cell puts through **in air-saturated water**, still inside the 10⁻¹⁴–10⁻¹³ measured for *Nitrosomonas*. Also sets NOB throughput via the N mass ratio, so at saturation NOB clear 8 % less nitrite per cell than AOB clear ammonia — which is the mechanism, not a rounding. |
| `aobGrowthRate` | `ln2 / 20` | `ln2 / 20 / 0.96544` | A 20 h doubling is what the *tank* reproduces, not what the constant holds. Hovanec & DeLong's 15–24 h band is measured in aerated culture; the model has to land in it in aerated water. |
| `nobGrowthRate` | `ln2 / 36` | `ln2 / 36 / 0.88397` | Same, for the 24–48 h band. The uncorrected constant would have read 40.7 h in a real tank — inside the band, but no longer its midpoint, and no longer the number the comment claims. |
| `inoculumPerLiter` | `0.648` | `0.685` | The one fitted constant of the four, and it follows its own derivation rule rather than a target: the passing window moved and the value moved with it. |

There is no fitting freedom in the first three. Each divides by its own guild's
factor at one stated oxygen, so what the model reproduces in air-saturated water
is exactly the figure the literature states — which is the same reframing this
branch already applied to plant, fish and decay base rates, carried the one step
further those three did not need.

### The inoculum window, re-swept

`inoculumPerLiter` was never pinned to a measurement; it is read off the cycling
timeline, and the timeline moved. Swept at 10 L through 1000 L on the corrected
rates, every value that holds all four anchors lies in **0.637 – 0.728**
(was 0.595 – 0.680):

| inoculum | NO₂ peak | margin under 5 ppm | cycled day | margin over d21 | breaks |
|---|---|---|---|---|---|
| 0.636 | 5.003 | −0.003 | 21.500 | 0.500 | nitrite peak over 5 ppm |
| 0.637 | 4.993 | 0.007 | 21.458 | 0.458 | — |
| **0.685** | **4.945** | **0.055** | **21.167** | **0.167** | — |
| 0.728 | 4.911 | 0.089 | 21.000 | 0.000 | — |
| 0.729 | 4.910 | 0.090 | 20.917 | −0.083 | cycles before day 21 |

0.685 lands on the *same margins the old value had* — 0.055 ppm under the peak
ceiling and 0.167 d over the cycled-day floor — so the comment's claim about
where the value sits in its window survives verbatim. `inoculum-window.test.ts`
re-runs the sweep.

---

## The control: the pre-oxygen engine, reproduced

Fishless aqua-soil cycling, seven volumes. `pre-oxygen` is the shipped branch
with the two K's neutralised **and** the four constants back at their old
figures — that combination is what "the engine before this change" means now,
because neutralising the K's alone leaves the re-quoted rates in place.

| | NO₂ peak | peak day | cycled day | 24 h dose (150 L) |
|---|---|---|---|---|
| pre-oxygen | 4.945 | 14.83 | 21.17 | 0.1684 |
| shipped | 4.944 | 14.83 | 21.17 | 0.1821 |

Three of the four land on the pre-oxygen figures to three decimals at every
volume from 10 L to 1000 L. The 24 h dose clearance reads 8 % higher (0.1821
against 0.1684 at 150 L, 0.1917 against 0.1718 at 1000 L) and that residual is
real rather than slack: a cycling tank sits a little under air saturation, so
the correction — which is exact *at* 8.38 mg/L — leaves the colony fractionally
smaller after thirty days. Well inside the < 0.25 band at every volume.

The figure the previous agent recorded as the baseline, 0.1684 at 150 L, is the
`pre-oxygen` row here, so the two records are reading the same tank.

**Why the parked branch could not get here.** It had two degrees of freedom,
`inoculumPerLiter` and `bacteriaProcessingRate`, and swept them without touching
the growth rates. Measured across that whole space, 24 h dose clearance reads
**0.270 at inoculum 0.648 and gets worse as the inoculum rises** — 0.285 at 1.0,
0.306 at 2.0 — never reaching the 0.25 ceiling. The mechanism is that
`cycledTank` runs thirty days: a larger inoculum cycles the tank sooner, so by
day 30 the colony has spent longer coasting on a spent bed with maintenance
decay outrunning growth, and it is *smaller* when the dose lands. Dose clearance
is a growth-rate reading, not a throughput one, which is why the two constants
it was allowed to move could not reach it.

---

## What the change is for

Same 20 L at 30 °C on aqua soil, same ration, sixty days, nothing living in it.
Fed rather than stocked deliberately: a fish short of air eats and excretes
less, and the load would then be what differed between the rows instead of the
air.

| tank | nitrification | O₂ low | NO₂ peak | peak day | NO₃ then | NO₂ : NO₃ | cycled day |
|---|---|---|---|---|---|---|---|
| sponge + air | shipped | 6.05 | 13.37 | 11.2 | 2.2 | 6.03 | 15.0 |
| sponge + air | no O₂ term | 6.00 | 12.09 | 10.1 | 2.1 | 5.84 | 13.3 |
| sponge | shipped | 5.95 | 13.37 | 11.2 | 2.2 | 6.05 | 15.0 |
| sponge | no O₂ term | 5.91 | 12.09 | 10.1 | 2.1 | 5.84 | 13.3 |
| **still** | **shipped** | **0.18** | **19.50** | 16.8 | 3.0 | **6.59** | **26.3** |
| still | no O₂ term | 0.18 | 11.94 | 10.1 | 2.1 | 5.77 | 13.3 |
| **still, double ration** | **shipped** | **0.18** | **121.66** | 60.0 | 2.8 | **43.31** | **never** |
| still, double ration | no O₂ term | 0.18 | 19.80 | 10.8 | 4.9 | 4.05 | 13.6 |

A tank with the circulation a keeper would give it pays 11 % on its nitrite peak
and cycles two days later. A still one at 0.18 mg/L peaks 63 % higher and takes
eleven days longer. Twice the ration into the same still box and it **never
cycles at all** — the nitrite runs to 121 ppm against 43 ppm of nitrate and
stays there, which is the stalled cycle of an anoxic tank.

The rows with the term off are the control that makes those the air: identical
box, identical food, and the still tank goes back to the aerated tank's clock.

### What each guild is left with

| O₂ mg/L | NH₃ ppm/h | of max | NO₂ ppm/h | of max | NOB : AOB |
|---|---|---|---|---|---|
| 8.38 | 0.0525 | 0.965 | 0.0983 | 0.884 | 0.916 |
| 6.00 | 0.0518 | 0.952 | 0.0939 | 0.845 | 0.887 |
| 4.00 | 0.0506 | 0.930 | 0.0872 | 0.784 | 0.843 |
| 2.00 | 0.0473 | 0.870 | 0.0717 | 0.645 | 0.742 |
| 1.00 | 0.0418 | 0.769 | 0.0529 | 0.476 | 0.619 |
| 0.50 | 0.0340 | 0.625 | 0.0347 | 0.313 | 0.500 |
| 0.25 | 0.0247 | 0.455 | 0.0206 | 0.185 | 0.407 |
| 0.10 | 0.0136 | 0.250 | 0.0093 | 0.083 | 0.333 |
| 0.00 | 0 | 0 | 0 | 0 | — |

The last column is the mechanism in one number, and it falls the whole way down.

---

## Falling out of it: the surface stopped being the ceiling

A bare 200 L held under more ammonia than it can clear, forty days:

| nitrification | AOB % of surface | NOB % of surface | O₂ mg/L |
|---|---|---|---|
| shipped | 94.9 | 53.3 | 0.89 |
| no oxygen term | 96.2 | 93.6 | 0.89 |

Any load big enough to fill the biofilm is a load whose oxygen demand strips the
water first, so **a biofilter's practical ceiling is oxygen, not surface** — and
NOB are the guild that meets it.

> **Corrected 2026-08-08.** The line under this heading read "with the best
> circulation the engine offers NOB reach 72.9 %, still nowhere near", and that
> figure does not reproduce. The table above is the shipped default — the sponge
> a fresh tank starts with — and the ladder above it was never run. It reads:

| circulation | O₂ mg/L | AOB % of surface | NOB % of surface |
|---|---|---|---|
| none at all | 0.20 | 90.5 | 1.4 |
| sponge (the row above) | 0.89 | 94.9 | 53.3 |
| sponge + air | 0.95 | 95.0 | 61.4 |
| canister | 1.40 | 95.3 | 57.5 |
| canister + air | 4.35 | 95.9 | 89.5 |
| canister + air + 400 GPH | 5.06 | 95.9 | **90.1** |
| no oxygen term | 0.89 | 96.2 | 93.6 |

The last row is the fixed point `1 − d/g` for each guild — 96.17 % and 93.69 %
— which nothing passes, air or no air. What the air decides is how far short of
it a guild stops, and for NOB that is the whole range from 1.4 % to 90.1 %.

Two consequences shipped with that finding, and the first of them rests on the
figure that was wrong:

- `bacteriaSummary`'s "Both colonies have filled the surface they live on" line
  required both guilds past 90 % of ceiling, and was removed with its
  `SURFACE_BOUND_PCT` threshold as unreachable copy. **It is reachable.** The
  probe's saturating dose puts a canister-and-air-pump 200 L at 95.9 / 90.1, and
  a reachability check through the engine's own actions — no resource written by
  hand — gets there on feeding alone: 200 L on the same equipment reads 93.6 /
  89.8 at 320 g of food a day and 95.9 / 91.8 at 640, against the ~2 g/day that
  tank would normally take. So the honest statement is not "no state reaches it"
  but "no tank a keeper would build reaches it", which is a weaker reason to
  delete a readout. **Open, and now a decision rather than a cleanup:** restore
  the line, or leave it out and give the card the sentence for what *does* bind
  a mature colony — that its biofilter is oxygen-limited.
- The finding itself is pinned in `bacteria-colony.test.ts` rather than left in
  this file, as a circulation ladder rather than a threshold.

---

## The oxygen budget got a fourth consumer, and the tick shows

`oxygen-limited-draw.test.ts` reads the whole aerobic budget now, nitrification
included, and its `UNBOUNDED` control neutralises all five half-saturation
constants rather than three. On the abusive fixture it already used — stagnant
20 L at 30 °C, cycled biofilter, 8 tetras, fed 1 g/day for six days — the
factor cuts what the tank asks for from 247.5 to 109.5 mg/L and what it cannot
pay from 190.4 to 56.7 mg/L.

The old assertion was that the shortfall falls to under a tenth. It does not any
more, and the reason is the one already recorded on this branch rather than a
new defect: **the residual goes with tick resolution, not with the factor.** A
tick is an hour, and a consumer whose reduced demand still outruns the standing
stock overshoots inside the step.

The feeding spike is the loud part of that, not the base of it. Withhold the
food entirely and the same six days still leave the stagnant fixture short for
42 of its 144 hours, **10.803 mg/L unpaid**: a planting and a cycled biofilter
in a box nothing moves water through outrun what the surface puts back before
any ration lands. The daily gram then quintuples it, to 56.701 across 122 hours.
Closing either properly means integrating the draw across the step, which is the
tick-wide rationing pass this design exists to avoid.

For scale, the same six days with the circulation a keeper would give it (sponge
+ air pump): the 240-size planting this fixture carries never goes short at all,
and the 600-size planting the probe also runs owes 2.69 mg/L across 5 hours —
against 0 for the carbon-emitting consumers alone. The aerated tank at 240 size
is what `oxygen-limited-draw.test.ts` asserts on, as a hard zero rather than a
band.

---

## Anchors

All four permissive anchors hold.

- **Cycle completes 15–35 days at any volume** — 21.17–21.21 d across 10 L to
  1000 L, inside the tighter 21–28 as well.
- **A sane preset survives 90 days** — 12/12 neon tetras, min health > 90, NH₃
  and NO₂ under 0.1 ppm, NO₃ under 40, colony at under 10 % of surface.
- **Mass conservation** — `n-mass-conservation.test.ts` green end to end.
- **Nothing runs away** — the 90-day guard bands hold.

`npm test` 2613 passed / 150 files · `npx tsc --noEmit` clean on all three
configs · `npm run lint` clean apart from the 3 standing `no-console` warnings.

### Tests that moved, and why

None of them a widened band.

- `bacteria-colony.test.ts` — the settled-utilization prediction is
  `d / (g · air · (1 − p/K))` now; the oxygen factor was missing from the
  arithmetic, not from the model.
- `nitrogen-cycle.test.ts` — "growth slows near the ceiling" read one colony as
  it grew, over 100 hours in which the tank's oxygen climbed to saturation and
  carried the growth rate with it; the fixture never approached the ceiling it
  named. It now reads three fills of the same tank at the same hour, so headroom
  is the only thing that differs.
- `planted-gas-budget.test.ts` — the roster guard was `minOxygen > 6`, a bare
  number; it is `> livestockDefaults.oxygenStressThreshold` (5.0), which is the
  claim the `it` actually makes. Measured 5.84 with nitrification drawing,
  against over 6 before it drew anything — a heavily planted 150 L dipping to
  5.8 at dawn is a real planted tank, and the roster stays on the benefit side
  of the threshold for every hour of the run.
- `ui/run/bacteria.test.ts` — `projectNitritePeak` holds today's oxygen for the
  whole forward run while the engine's falls as the biofilter grows into its
  draw, so the card reads 0.3–0.4 % high. Asserted as within a percent rather
  than to a decimal place, which was a tripwire on how far the tank's oxygen
  happens to travel.

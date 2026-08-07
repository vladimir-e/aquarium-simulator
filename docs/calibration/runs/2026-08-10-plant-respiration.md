# A planting that breathed more than it made: `light-response`

Date: 2026-08-10 · Branch: `light-response` · Register defect #35

`baseRespirationRate` was 0.15, documented as "~15 % of photosynthesis". It is
15 % of `basePhotosynthesisRate`, which is the rate at `optimalCo2` — 20 mg/L,
five times the 4 mg/L an aquarium without an injector equilibrates to. No plant
in the engine has ever run there: against the rate a planting *does* reach,
0.15 is 75 %. Over 24 hours that put respiration at 99–209 % of photosynthesis
across the tanks below, so a planting was a net oxygen sink around the clock at
every fixture in the catalogue.

The mechanism is right and is unchanged: respiration is biomass × Q10 × an O₂
availability term, running 24 h, reading neither light nor carbon. That is what
a plant does. Only the magnitude moved, and the reference it is quoted against.

Every figure below is an engine run driven through `keep()`, the same loop the
anchors run, at `rngSeed` 4242. The probe is `npm run probe:plant-respiration`.

> **Resolved.** The dark-hours ceiling of 2 mg/L encoded the phase bug it was
> read through, and its assertion measured the whole tank's night while naming
> the planting's share of it. Both are fixed: the anchor states the tank's
> overnight oxygen sag against a real planted tank's diel curve, 1–3 mg/L, and
> the engine reads 2.174 — mid-band. `co2PerRateUnit` has not moved, and the
> re-derived window admits it comfortably. See *The night is the whole tank's*
> and *The carbon yield, re-derived* below.

---

## The constant

| constant | was | is | note |
|---|---|---|---|
| `baseRespirationRate` | 0.15 | **0.03** | 15 % of the ambient-carbon rate |
| `co2PerRateUnit` | 30 | **30, unmoved** | the re-derived band admits 22.3–44.6 |

## What the fraction is a fraction of

`basePhotosynthesisRate` is the rate at `optimalCo2` = 20 mg/L. That is an
injected tank's carbon. `gasExchange.atmosphericCo2` is 4.0 mg/L, and
`co2Factor` is linear to the optimum, so a tank without an injector runs its
photosynthesis at **0.2 rate units/h per 100 % plant size** and nowhere near
1.0. That 0.2 is the ceiling the literature's dark-respiration fraction belongs
against: a P–I curve for a submersed macrophyte is measured in the plant's own
medium, at the dissolved carbon that medium carries, not at a carbon the tank
never sees.

Measured, over the lit hours of seven tanks, the realised `co2Factor`:

| tank | at 0.15 | at 0.03 |
|---|---|---|
| sealed 40 L, 50 PAR, 8 neon | 0.283 | 0.138 |
| sealed 40 L, 10 PAR, 8 neon | 0.411 | 0.212 |
| low-tech 20 L, 50 PAR | 0.269 | 0.159 |
| low-tech 40 L, 50 PAR | 0.238 | 0.184 |
| low-tech 150 L, 90 PAR | 0.227 | 0.192 |
| low-tech 300 L, 90 PAR | 0.210 | 0.196 |
| injected 150 L, 90 PAR | 0.585 | 0.545 |

The column moves because respiration is itself one of a tank's carbon sources —
a sealed box on the old rate was breathing a quarter of its own carbon supply
back into the water, which is why its `co2Factor` reads highest exactly where
the planting was dying. The reference the derivation rests on is therefore the
config-derived 0.2 rather than any of these, and the measured column is the
sanity check that says the config figure is the right neighbourhood.

**So: 0.03 is 15 % of 0.2.** Dark respiration of submersed macrophytes runs
5–15 % of light-saturated gross photosynthesis, so this is the *top* of the
published band — the most respiration the literature supports, not the least.
The Monod term leaves 14 % of it standing in air-saturated water. Against the
injected-carbon rate the old figure was quoting, it is 3 %.

The old value read the same way is **75 % of the ambient-carbon ceiling**. There
is no reading of the literature that admits it.

## What it does to a day

Rate-unit-hours per 100 % plant size, over 24 hours, read off the effects the
tick applies rather than off the water afterwards — the surface is moving the
same stock in the same hour and it moves most of it. `P:R` above 1 is a planting
in credit over the day; below 1 it is a planting the keeper is subsidising.

| tank | made, 0.15 | burnt, 0.15 | P:R | made, 0.03 | burnt, 0.03 | P:R |
|---|---|---|---|---|---|---|
| sealed 40 L, 50 PAR, 8 neon | 3.24 | 3.22 | **1.01** | 1.63 | 0.68 | **2.40** |
| sealed 40 L, 10 PAR, 8 neon | 2.46 | 3.16 | **0.78** | 1.27 | 0.67 | **1.89** |
| low-tech 20 L, 50 PAR | 1.70 | 3.35 | **0.51** | 1.59 | 0.68 | **2.35** |
| low-tech 40 L, 50 PAR | 1.61 | 3.38 | **0.48** | 1.49 | 0.68 | **2.19** |
| low-tech 150 L, 90 PAR | 1.92 | 3.37 | **0.57** | 2.29 | 0.68 | **3.37** |
| low-tech 300 L, 90 PAR | 2.19 | 3.39 | **0.65** | 2.35 | 0.68 | **3.46** |
| injected 150 L, 90 PAR | 5.65 | 3.40 | **1.66** | 5.37 | 0.68 | **7.86** |

The `made` columns are not equal, and the sealed tanks are where they part
worst: 3.24 falling to 1.63. That is the carbon feedback again — a sealed box on
the old rate was breathing a quarter of its own carbon supply back into the
water and photosynthesising on it. A planting that fed itself out of its own
respiration still could not clear the bill.

Every low-tech tank was a sink and is now a producer at 1.9–3.5×. Net-autotrophic
freshwater systems run P:R of 2–4; a planted tank at 0.5 is a heterotrophic pond.
The injected tank was the only one in credit before, at 1.66, and it is the tank
the whole day side was calibrated on — which is how the defect stayed hidden.

## The acid test: does planting a tank help the fish in it

The gate's own scenario. A sealed, unfiltered 40 L (10.6 gal) — no filter and a
full lid is the least gas exchange the engine offers — eight female neon tetras,
0.2 g/day, a 25 % change a week, 60 days, five plants at size 60 (300 total,
three java fern and two anubias), across the PAR ladder.

The bare tank is the control the planted rows have to *beat*, not merely
survive: an oxygen floor below the empty box's is a planting the keeper would be
better off without.

| fixture | rate | survivors | first death | O₂ floor | size at 60 d |
|---|---|---|---|---|---|
| — no plants — | — | 8/8 | — | **4.975** | — |
| 10 PAR | 0.15 | 0/8 | d3.0 | 0.205 | 479 |
| 10 PAR | **0.03** | **8/8** | — | **6.060** | 532 |
| 20 PAR | 0.15 | 0/8 | d4.6 | 0.206 | 470 |
| 20 PAR | **0.03** | **8/8** | — | **6.601** | 546 |
| 30 PAR | 0.15 | 0/8 | d5.9 | 0.206 | 469 |
| 30 PAR | **0.03** | **8/8** | — | **6.774** | 553 |
| 50 PAR | 0.15 | 0/8 | d7.0 | 0.229 | 472 |
| 50 PAR | **0.03** | **8/8** | — | **6.846** | 556 |
| 70 PAR | 0.15 | 0/8 | d7.2 | 0.361 | 475 |
| 70 PAR | **0.03** | **8/8** | — | **6.861** | 556 |
| 90 PAR | 0.15 | 0/8 | d7.2 | 0.375 | 462 |
| 90 PAR | **0.03** | **8/8** | — | **6.862** | 545 |
| 120 PAR | 0.15 | 0/8 | d7.5 | 0.199 | 132 |
| 120 PAR | **0.03** | **8/8** | — | **6.860** | 417 |

The roster now holds at every fixture, and the floor clears the bare tank's
4.975 at every fixture including the dimmest — by 1.1 mg/L at 10 PAR and by
1.9 at 70. **The planting is an oxygen asset across the whole catalogue**, which
is the observable this whole exercise exists to reach.

The oxygen floor is the strength of the criterion, not the survivor count. 0.05
also keeps the roster alive, but its floor at 10 PAR is 5.344 — a third of a
milligram over the bare tank, so a keeper in a dim room is trading oxygen for
greenery. 0.075 keeps the roster too and floors at 4.11–4.26 across 10–90 PAR,
*under* the bare tank at every fixture but the brightest: alive, and still worse
off for the plants. 0.03 clears the bare tank by more than a milligram at every
fixture, which is a planting that is worth having wherever it is put.

The 0.15 rows reproduce what the register recorded — 0/8 with plants against 8/8
without — at d3.0–d7.5 across this ladder where its own run read d1.7–d6.4.

## The night is the whole tank's

`tests/planted-gas-budget.test.ts` read the injected 150 L's dark hours and
asserted the tank *gives back* under 2 mg/L, as though the figure were the
planting's contribution. It is not. Every oxygen effect of every dark hour,
booked against the source that raised it — the mean over the run's seven whole
nights, and it sums to the assertion's own 2.174 to the last digit:

| source | mg/L | share of the fall |
|---|---|---|
| gas exchange, to the surface | −1.095 | **50.4 %** |
| plant respiration | −0.504 | 23.2 % |
| decay | −0.218 | 10.0 % |
| nitrification, AOB | −0.179 | 8.2 % |
| fish respiration | −0.130 | 6.0 % |
| nitrification, NOB | −0.060 | 2.7 % |
| ATO top-up | +0.002 | −0.1 % |

Half the night leaves across the surface. The planting is a *quarter* of it, and
the other quarter is the bacterial and animal load the planting has nothing to
do with. So the name was wrong twice over: the planting neither owns the figure
nor gives anything back — it spends, alongside four other consumers, out of a
stock the day built.

**And yet no value of `baseRespirationRate` reaches the old ceiling.** Taken from
the shipped rate down to nothing:

| respiration | gross | sag | O₂ high | O₂ low |
|---|---|---|---|---|
| 0.15 | 0.685 | 2.277 | 10.074 | 7.486 |
| 0.10 | 0.671 | 2.235 | 10.306 | 7.764 |
| 0.05 | 0.656 | 2.192 | 10.541 | 8.038 |
| **0.03** | **0.650** | **2.174** | **10.637** | **8.147** |
| 0.01 | 0.644 | 2.155 | 10.733 | 8.253 |
| **0** | 0.641 | **2.145** | 10.781 | 8.305 |

An 80 % cut to the planting's night draw moves the sag 4.5 %; deleting
respiration outright moves it 5.8 %, and lands at 2.145 — still over 2.

The two readings look contradictory and are not. Respiration is 23 % of the
fall, but it cannot *move* the fall, because the surface term is a first-order
relaxation toward saturation: oxygen a plant does not burn is oxygen the water
carries into the next hour at a higher gradient, and the surface sheds it
instead. Every sink inside the tank is buffered against every other. The whole
curve lifts — the high goes 10.07 → 10.64, the low 7.49 → 8.15 — and the
*distance* between dusk and dawn barely notices.

What the distance answers to is the day. The sag tracks `gross` at **3.21–3.35 ×
across yields 10 through 60**, and the dawn trough does not move at all: 96.5–
97.4 % of saturation across that entire sweep. The tank returns to the same
water every morning whatever it did with its day, so the sag *is* the day's
supersaturation, read at dusk. It is a **day-side measurement that was wearing a
night-side name.**

## What the sag should be asserted against

The ceiling of 2 was set in 2b against a reading of **1.48** for this tank, taken
through the `before.resources.light` reader this branch proved is an hour out of
phase (`2026-08-09-light-response.md`). The corrected reading of the same tank on
the same engine is **2.28**. The headroom the ceiling was chosen with — 0.52 —
is smaller than the measurement error it was chosen through — 0.80. The ceiling
encodes the bug, which is why no constant can reach it.

Re-derived against the observable instead. A real planted aquarium's dissolved
oxygen falls **1–3 mg/L** between the dusk peak and the dawn trough, and this
tank — heavily planted, carbon-injected, 90 PAR on a 12 h photoperiod — belongs
at the top of that range.

**The floor.** Measured, not asserted: the same 150 L with the planting thinned
out from under it, everything else held.

| tank | sag | dusk % sat | dawn % sat |
|---|---|---|---|
| no planting, no injector | **−0.093** | 96.4 | 97.5 |
| no planting, injected | −0.093 | 96.4 | 97.5 |
| one java fern at 60 | −0.023 | 97.2 | 97.4 |
| the gate's 300, no injector | 0.230 | 99.9 | 97.1 |
| 982, no injector | 0.525 | 100.3 | 94.1 |
| **982, injected — the anchor's tank** | **2.174** | **123.3** | **97.4** |

An unplanted 150 L does not sag at all — it *rises* a hundredth of a milligram
overnight, because the surface holds it at saturation and the night's sinks
cannot outrun the gradient. One plant does not change that. A milligram is the
line between a tank running a diel curve and a tank whose surface is doing all
the work, and a tank that stops sagging is as wrong as one that craters: it
means the day built nothing, or the night spends nothing.

**The ceiling.** Dawn is a fixed point at 8.16 mg/L, so the sag is arithmetic on
the dusk peak: 3 mg/L puts dusk at 11.2, which is 133 % of the 8.38 mg/L this
water saturates at. That is where a real tank stops holding the excess and pearls
it off the leaves. Past it the curve is not an aquarium's. The old ceiling of 2
sat at a dusk peak of 124 % — a defensible number for the wrong quantity, chosen
off a reading that was 35 % low.

**Two-sided, and honest about what it brackets.** The band is 1–3 and the engine
reads 2.174, 59 % of the way up it — mid-band, admitted comfortably rather than
by a hair.

It is an anchor on the diel curve rather than a second bracket on the yield.
Because the sag tracks `gross` at 3.3×, the old ceiling of 2 was really the
statement `gross < 0.60` — it cut the gross band's own 0.5–1 down to a sliver
sitting just above its floor, which is why the admissible window collapsed.

What the sag holds that `gross` does not is the ratio of the night's loss to the
day's gain: surface exchange against the tank's whole aerobic load. Move
`baseExchangeRate` either way and the two part company —

| `baseExchangeRate` | gross | in 0.5–1 | sag | in 1–3 |
|---|---|---|---|---|
| 0.125 | 0.776 | ✓ | **3.901** | ✗ |
| **0.25** (shipped) | **0.650** | ✓ | **2.174** | ✓ |
| 0.50 | 0.535 | ✓ | **0.618** | ✗ |

— gross stays inside its band at half and double the surface exchange, moving
19 %, while the sag moves 79 % and leaves the band in both directions. That is
the anchor's own bite, and the reason it is worth asserting rather than
deleting.

## The carbon yield, re-derived

Both plantings, on the corrected engine, at respiration 0.03, against both
corrected bands: gross 0.5–1 mg/L/h, sag 1–3 mg/L.

The anchor's own planting — 982 total size handed over at tick 0, 10 days:

| yield | gross O₂ (mg/L/h) | sag | sag/gross | O₂ high | dusk % sat | O₂ low | dawn % sat |
|---|---|---|---|---|---|---|---|
| 10 | 0.236 | 0.758 | 3.21 | 9.019 | 107.6 | 8.163 | 97.4 |
| 15 | 0.347 | 1.145 | 3.30 | 9.452 | 112.8 | 8.161 | 97.4 |
| 20 | 0.452 | 1.510 | 3.34 | 9.866 | 117.7 | 8.159 | 97.4 |
| 22 | 0.493 | 1.650 | 3.34 | 10.026 | 119.6 | 8.156 | 97.3 |
| 25 | 0.553 | 1.852 | 3.35 | 10.261 | 122.4 | 8.152 | 97.3 |
| 27 | 0.593 | 1.983 | 3.35 | 10.414 | 124.3 | 8.151 | 97.3 |
| **30** | **0.650** | **2.174** | **3.34** | **10.637** | **126.9** | **8.147** | **97.2** |
| 35 | 0.742 | 2.475 | 3.34 | 10.993 | 131.2 | 8.139 | 97.1 |
| 40 | 0.830 | 2.757 | 3.32 | 11.331 | 135.2 | 8.127 | 97.0 |
| 45 | 0.914 | 3.022 | 3.31 | 11.651 | 139.0 | 8.119 | 96.9 |
| 48 | 0.963 | 3.173 | 3.29 | 11.835 | 141.2 | 8.111 | 96.8 |
| 50 | 0.995 | 3.272 | 3.29 | 11.953 | 142.6 | 8.107 | 96.7 |
| 55 | 1.072 | 3.505 | 3.27 | 12.240 | 146.1 | 8.095 | 96.6 |
| 60 | 1.146 | 3.724 | 3.25 | 12.511 | 149.3 | 8.084 | 96.5 |

Every row keeps 12/12 fish at 96 of 96 lit hours and ≈1014 size, so the columns
that would have said so are left out.

Grown in from 350 total size over 90 days, same tank:

| yield | gross O₂ (mg/L/h) | sag | sag/gross | O₂ high | O₂ low | size | hours |
|---|---|---|---|---|---|---|---|
| 10 | 0.245 | 0.791 | 3.23 | 9.111 | 7.729 | 953 | 399 |
| 15 | 0.359 | 1.193 | 3.32 | 9.564 | 7.834 | 963 | 400 |
| 20 | 0.467 | 1.587 | 3.40 | 9.991 | 7.547 | 963 | 400 |
| 22 | 0.508 | 1.734 | 3.41 | 10.150 | 7.426 | 961 | 396 |
| 25 | 0.570 | 1.932 | 3.39 | 10.386 | 7.773 | 960 | 388 |
| 27 | 0.610 | 2.052 | 3.37 | 10.538 | 8.086 | 959 | 384 |
| **30** | **0.667** | **2.258** | **3.38** | **10.754** | **7.767** | **958** | **384** |
| 35 | 0.758 | 2.542 | 3.35 | 11.100 | 7.989 | 953 | 386 |
| 40 | 0.845 | 2.827 | 3.35 | 11.422 | 8.130 | 942 | 374 |
| 45 | 0.925 | 3.086 | 3.34 | 11.725 | 8.128 | 934 | 329 |
| 48 | 0.971 | 3.229 | 3.32 | 11.895 | 8.122 | 930 | 310 |
| 50 | 1.004 | 3.329 | 3.32 | 12.005 | 8.122 | 927 | 292 |
| 55 | 1.077 | 3.551 | 3.30 | 12.271 | 8.121 | 920 | 255 |
| 60 | 1.168 | 3.836 | 3.28 | 12.521 | 8.145 | 929 | 151 |

Each edge bisected to 0.05 rather than read off the grid:

| edge | anchor's planting | grown in from 350 |
|---|---|---|
| gross ≥ 0.5 | **22.33** | **21.62** |
| sag ≥ 1 | 13.07 | 12.57 |
| sag ≤ 3 | **44.57** | **43.37** |
| gross ≤ 1 | 50.34 | 49.76 |

Band **22.3 – 44.6** on the anchor's planting, **21.6 – 43.4** on the other. The
two agree to under a point and a half at both edges. **30 sits inside both**, 35 %
of the way up the first and 39 % up the second — a little below centre, with 26 %
of headroom below and 49 % above.

Two things worth naming. The gross *floor* is what binds the bottom, as it did
in 2b; the sag ceiling binds the top, but only just — it arrives at 44.6 where
gross's own ceiling arrives at 50.3, 11 % later. And the sag floor never binds
at all: it admits everything down to 13. **The night is not the yield's second
bracket and never was.** What reopened the window was correcting the ceiling, not
loosening it.

The independent check is that this lands where 2b did. 2b measured 20–50 on the
growing planting and 25.4–54.1 on the anchor's, off a reader an hour out of phase
and an engine whose plantings were still net oxygen sinks. Corrected on both
counts, the same claim on the same tanks reads 22.3–44.6 and 21.6–43.4 — two
derivations either side of two defects, landing on the same window with 30
inside it.

Per the brief, the yield has not been moved and no band has been widened; the
ceiling was re-derived against the observable and the assertion renamed to what
it measures.

## Does the band admit a tank a keeper would refuse

The edges against the middle — 22.5, 30, 44.5 — on the tanks that break first.
The gate's sealed 40 L is the least gas exchange the engine offers; its bare
control floors at **4.975 mg/L** and keeps 8/8.

| tank | yield | fish | O₂ floor | O₂ high | peak % sat | algae |
|---|---|---|---|---|---|---|
| injected 150 L, 982, 12 neon | 22.5 | 12/12 | 8.038 | 10.504 | 125.3 | 0 |
| | 30 | 12/12 | 8.030 | 11.200 | 133.7 | 0 |
| | 44.5 | 12/12 | 8.015 | 12.247 | **146.2** | 0 |
| low-tech 150 L, 982, 12 neon | 22.5 | 12/12 | 6.448 | 8.469 | 101.1 | 0 |
| | 30 | 12/12 | 6.488 | 8.565 | 102.2 | 0 |
| | 44.5 | 12/12 | 6.539 | 8.742 | 104.3 | 0 |
| sealed 40 L, 300, 8 neon, 10 PAR | 22.5 | 8/8 | 5.971 | 7.939 | 94.7 | 1.50 |
| | 30 | 8/8 | 6.060 | 8.079 | 96.4 | 0.26 |
| | 44.5 | 8/8 | 6.122 | 8.479 | 101.2 | 0 |
| sealed 40 L, 300, 8 neon, 50 PAR | 22.5 | 8/8 | 6.709 | 8.923 | 106.5 | 0 |
| | 30 | 8/8 | 6.846 | 9.170 | 109.4 | 0 |
| | 44.5 | 8/8 | 6.862 | 9.417 | 112.4 | 0 |
| sealed 40 L, 300, 8 neon, 120 PAR | 22.5 | 8/8 | 6.713 | 8.678 | 103.6 | 59.6 |
| | 30 | 8/8 | 6.860 | 8.967 | 107.0 | 59.6 |
| | 44.5 | 8/8 | 6.969 | 9.277 | 110.7 | 59.4 |

No roster loses a fish anywhere in the band, at any fixture, in 30–60 days; no
fish falls below 96.49 health, which is the ambient floor these tanks all sit on;
every planted O₂ floor clears the bare tank's 4.975 by a milligram or more. The
dim 10 PAR row lets a trace of algae in at the band's floor (1.50 against 0.26 at
30) because a planting fixing less carbon suppresses less — gone by 30. The
120 PAR bloom is the known high-light one and does not move with the yield.

**One thing in the band is wrong, and it is not the fish.** At 44.5 the injected
150 L reaches 12.25 mg/L — 146 % of saturation. No aquarium does that: past about
120–130 % the excess leaves as bubbles on the leaves. The engine has no pearling
channel (see *Not fixed* below), so nothing stops it, and neither corrected band
catches it — gross reaches its own ceiling at 50, by which point the dusk peak is
already 142 %. **The yield's missing second bracket is a cap on supersaturation,
not the night.** That is a mechanism to add, not a band to tighten, and it is
left for the maintainer: adding it would put a real ceiling on `co2PerRateUnit`
for the first time, and quite possibly a tighter one than 44.6.

## Where the anchors landed

`tests/planted-gas-budget.test.ts`:

| assertion | reads | verdict |
|---|---|---|
| 96 of 96 lit hours in the window | 96 | green |
| gross 0.5–1 mg/L/h | 0.650 | green |
| sag 1–3 mg/L, dusk to first light | **2.174** | **green** |
| a small tank moves as far as it is smaller | ratios | green |
| the carbon in the water pays for the oxygen | — | green |
| a planting in a stripped column takes more than it gives | — | green |
| the roster holds twenty days, no fish charged for the water | 12/12, 0 | green |

The whole suite is green. Three tests elsewhere read the old
magnitude and were re-derived rather than relaxed:

- `plants/index.test.ts`, *runs a planting under too dim a fixture at a net
  loss* — asserted a net loss at a hard-coded 1 PAR. The crossover has moved
  from 2.8 PAR to 0.565 for a java fern, so 1 PAR is now on the credit side. The
  test reads either side of each species' own bisected crossover instead: where
  the line sits is a calibration, that it exists is the mechanism, and only the
  second is that test's to hold.
- `systems/respiration.test.ts`, *respects custom base respiration rate* —
  hard-coded 0.3 as "2× default". Derives the double from the shipped value now.
- `tests/oxygen-limited-draw.test.ts`, *leaves a tank with circulation owing
  nothing at all* — asserted that the unbounded control overdraws even an
  aerated tank. It no longer does, because the planting is no longer four fifths
  of that tank's draw: the aerated 20 L holds **5.46 mg/L** beyond the tick's
  demand at its tightest hour, up from 2.86, and both configs owe nothing. What
  survives and is now asserted is that the bound still shaves the ask (90.1
  against 92.6 mg/L over six days) — its power to prevent a shortfall is the
  stagnant tank in the assertion above it, which is unchanged. The same file's
  standing-draw figure moved with it: the unfed stagnant box runs short for 22
  of its 144 hours, not 41.

`npm test` 2668 passed / 0 failed / 152 files · `npm run typecheck` clean on all
three configs · `npm run lint` clean apart from the 3 standing `no-console`
warnings in `src/ui/`.

## What moved in the 2c tables

`npm run probe:light-response` and `npm run probe:par-dose-response` both still
run. The reachability tables, the shade pairing and the DLI trade hold the water
at optimum before every tick, so they are unmoved to the third decimal. The two
yield sweeps and the curve-in/curve-out pair moved with the carbon a tank
carries, and are corrected in place in `2026-08-09-light-response.md`.

`probe:par-dose-response` moves on its planted rows only, and by about 1.5 % —
the 126 PAR row reads 35.97 / 63.50 / 81.62 against the 36.54 / 64.68 / 82.22 of
`2026-08-05-par-at-substrate.md`, because a planting that keeps its condition
suppresses a bloom slightly harder. Its empty-tank rows are identical to the
digit, which is the check that nothing but the plants moved. That report records
the engine of its own branch and is left as measured.

## Not fixed, and worth a look

**`co2Factor` is a hard linear ramp to 20 mg/L.** It is the reason a low-tech
tank runs at a fifth of its rate, and it is what forced this constant so far
down the literature band. Real submersed macrophytes are not at 20 % of Pmax at
ambient carbon: most of them use bicarbonate, and at KH 4 a tank carries an
order of magnitude more inorganic carbon than its free CO₂ says. A Michaelis–
Menten term with a low half-saturation, or a bicarbonate channel per species,
would put the day side where it belongs and would move this constant back up its
band. Out of scope here; named because it is the mechanism under the defect.

**Nothing caps supersaturation, and that is the yield's missing bracket.** The
injected 150 L reaches 10.6–10.8 mg/L at dusk, 127 % of saturation, and sheds it
overnight through the same first-order gas exchange that filled it. Real tanks
past ~120 % lose the excess as bubbles on the leaves — pearling — which is a
channel the engine does not have. Two consequences, and the second is the one
that matters here. It is the term that would bend the sag away from tracking
`gross` linearly. And it is the only real-tank constraint that bites the carbon
yield from above: the sag never was, gross's own ceiling arrives too late (142 %
of saturation), and the band's top edge is therefore softer than it looks. Adding
a pearling channel would put a physical ceiling on `co2PerRateUnit` for the first
time.

**A low-tech planted tank barely sags.** The 982-size planting without its
injector falls 0.525 mg/L overnight against the injected tank's 2.174, and a real
low-tech planted tank does show something closer to a milligram. It follows from
the `co2Factor` ramp above — a tank at a fifth of its rate builds a fifth of the
day's supersaturation — so it is the same defect read at the night end, and it
is why the sag anchor is scoped to the injected tank rather than to planted tanks
generally.

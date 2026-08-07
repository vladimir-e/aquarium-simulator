# A planting that breathed more than it made: `light-response`

Date: 2026-08-10 · Branch: `light-response` · Register defect #35

`baseRespirationRate` was 0.15, documented as "~15 % of photosynthesis". It is
15 % of `basePhotosynthesisRate`, which is the rate at `optimalCo2` — 20 mg/L,
five times the 4 mg/L an aquarium without an injector equilibrates to. No plant
in the engine has ever run there. Against the rate a planting *does* run at,
0.15 was 76–109 % on a low-tech tank, and the consequence is that a planting was
a net oxygen sink around the clock at every fixture in the catalogue.

The mechanism is right and is unchanged: respiration is biomass × Q10 × an O₂
availability term, running 24 h, reading neither light nor carbon. That is what
a plant does. Only the magnitude moved, and the reference it is quoted against.

Every figure below is an engine run driven through `keep()`, the same loop the
anchors run, at `rngSeed` 4242. The probe is `npm run probe:plant-respiration`.

> **Open, and unresolved.** The dark-hours give-back is not a respiration
> measurement — see *The night was never the planting's* below. The anchor's
> band is missed at 2.174 mg/L against a ceiling of 2, and it is missed at
> **2.145 with respiration taken to exactly zero**, so no value of this constant
> reaches it. The admissible window for `co2PerRateUnit` reads 22.4–27.3 on one
> planting and 21.6–26.2 on the other, and 30 sits outside both. Nothing has
> been moved and no band has been widened; the yield is the maintainer's call.

---

## The constant

| constant | was | is | note |
|---|---|---|---|
| `baseRespirationRate` | 0.15 | **0.03** | 15 % of the ambient-carbon rate |
| `co2PerRateUnit` | 30 | **30, unresolved** | the re-derived band admits 21.6–27.3 |

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

| tank | produced/d | burnt/d, 0.15 | P:R, 0.15 | burnt/d, 0.03 | P:R, 0.03 |
|---|---|---|---|---|---|
| sealed 40 L, 50 PAR, 8 neon | 1.63 | 3.22 | **1.01** | 0.68 | **2.40** |
| sealed 40 L, 10 PAR, 8 neon | 1.27 | 3.16 | **0.78** | 0.67 | **1.89** |
| low-tech 20 L, 50 PAR | 1.59 | 3.35 | **0.51** | 0.68 | **2.35** |
| low-tech 40 L, 50 PAR | 1.49 | 3.38 | **0.48** | 0.68 | **2.19** |
| low-tech 150 L, 90 PAR | 2.29 | 3.37 | **0.57** | 0.68 | **3.37** |
| low-tech 300 L, 90 PAR | 2.35 | 3.39 | **0.65** | 0.68 | **3.46** |
| injected 150 L, 90 PAR | 5.37 | 3.40 | **1.66** | 0.68 | **7.86** |

(`produced/d` is the 0.03 column; on the old rate it is higher, because the
plants were breathing carbon back into their own water — the sealed 40 L read
3.24 against 1.63. A planting that fed itself carbon out of its own respiration
still could not clear the bill.)

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

The dead runs are what the register recorded: 0/8 with plants, 8/8 without, and
first deaths from d3.0 to d7.5 across the ladder.

## The night was never the planting's

`tests/planted-gas-budget.test.ts` reads the dark-hours give-back on the
injected 150 L and asserts it under 2 mg/L. It read 2.277 before this change and
reads 2.174 after — a 4.5 % move on a 5× cut to the constant. Taken all the way
to zero:

| respiration | gross | dark give-back | O₂ high | O₂ low |
|---|---|---|---|---|
| 0.15 | 0.685 | 2.277 | 10.074 | 7.486 |
| 0.10 | 0.671 | 2.235 | 10.306 | 7.764 |
| 0.05 | 0.656 | 2.192 | 10.541 | 8.038 |
| **0.03** | **0.650** | **2.174** | **10.637** | **8.147** |
| 0.01 | 0.644 | 2.155 | 10.733 | 8.253 |
| **0** | 0.641 | **2.145** | 10.781 | 8.305 |

The planting's own night draw over those twelve dark hours is 2.50 mg/L at 0.15
and 0.50 at 0.03 — an 80 % cut. The give-back moves 4.5 %. The whole O₂ curve
lifts instead: the high goes 10.07 → 10.64 and the low 7.49 → 8.15, and the
*distance* between dusk and dawn barely notices.

The reason is that respiration runs in daylight too. Take it away and the day
peak rises by as much as the night fall would have shrunk, and what the water
sheds overnight is the supersaturation the day built, relaxing toward saturation
at `baseExchangeRate × flowFactor`. The give-back is a **day-side measurement
wearing a night-side name**: it tracks `gross` almost exactly — 0.758 at yield
10, 1.510 at 20, 2.174 at 30 — and it is very nearly `3.3 × gross` across the
whole sweep.

At 2.174 mg/L the engine's overnight sag is *inside* the 1–3 mg/L a real planted
tank shows, on a heavily-planted 150 L with carbon injection that would sag 3–4
in the hobby. The band is tighter than the observable, and the band was itself
read through a reader that was an hour out of phase until this branch corrected
it (`2026-08-09-light-response.md`). It has not been widened here.

## The carbon yield, re-derived

Both plantings, on the corrected engine, at respiration 0.03. Gross has to clear
0.5 mg/L/h and the dark hours have to give back under 2.

The anchor's own planting — 982 total size handed over at tick 0, 10 days:

| yield | gross O₂ (mg/L/h) | O₂ high | O₂ low | dark give-back | size | hours | fish |
|---|---|---|---|---|---|---|---|
| 10 | 0.236 | 9.019 | 8.163 | 0.758 | 1013 | 96 | 12 |
| 20 | 0.452 | 9.866 | 8.159 | 1.510 | 1013 | 96 | 12 |
| 22 | 0.493 | 10.026 | 8.156 | 1.650 | 1013 | 96 | 12 |
| 23 | 0.514 | 10.105 | 8.156 | 1.718 | 1013 | 96 | 12 |
| 25 | 0.553 | 10.261 | 8.152 | 1.852 | 1014 | 96 | 12 |
| 27 | 0.593 | 10.414 | 8.151 | 1.983 | 1014 | 96 | 12 |
| 28 | 0.612 | 10.489 | 8.148 | 2.048 | 1014 | 96 | 12 |
| **30** | **0.650** | **10.637** | **8.147** | **2.174** | **1014** | **96** | **12** |
| 35 | 0.742 | 10.993 | 8.139 | 2.475 | 1014 | 96 | 12 |
| 40 | 0.830 | 11.331 | 8.127 | 2.757 | 1014 | 96 | 12 |

Band **22.4 – 27.3**.

Grown in from 350 total size over 90 days, same tank:

| yield | gross O₂ (mg/L/h) | O₂ high | O₂ low | dark give-back | size | hours | fish |
|---|---|---|---|---|---|---|---|
| 10 | 0.245 | 9.111 | 7.729 | 0.791 | 953 | 399 | 12 |
| 20 | 0.467 | 9.991 | 7.547 | 1.587 | 963 | 400 | 12 |
| 21 | 0.487 | 10.068 | 7.418 | 1.664 | 962 | 398 | 12 |
| 22 | 0.508 | 10.150 | 7.426 | 1.734 | 961 | 396 | 12 |
| 24 | 0.550 | 10.306 | 7.469 | 1.876 | 960 | 391 | 12 |
| 26 | 0.589 | 10.460 | 8.071 | 1.986 | 959 | 386 | 12 |
| 27 | 0.610 | 10.538 | 8.086 | 2.052 | 959 | 384 | 12 |
| **30** | **0.667** | **10.754** | **7.767** | **2.258** | **958** | **384** | **12** |
| 35 | 0.758 | 11.100 | 7.989 | 2.542 | 953 | 386 | 12 |
| 40 | 0.845 | 11.422 | 8.130 | 2.827 | 942 | 374 | 12 |

Band **21.6 – 26.2**.

The two plantings agree to under a point at both edges, as they did before, and
the window is barely wider than the one 2c measured (21.0–25.5 and 21.4–26.1).
**The night did not stop being the binding edge**, because the night was never
the planting's to move. 30 sits 10 % above the ceiling on both.

Per the brief, the yield has not been moved and the band has not been widened.

## Where the anchors landed

`tests/planted-gas-budget.test.ts`:

| assertion | reads | verdict |
|---|---|---|
| 96 of 96 lit hours in the window | 96 | green |
| gross 0.5–1 mg/L/h | 0.650 | green |
| dark give-back < 2 mg/L | **2.174** | **red** |
| a small tank moves as far as it is smaller | ratios | green |
| the carbon in the water pays for the oxygen | — | green |
| a planting in a stripped column takes more than it gives | — | green |
| the roster holds twenty days, no fish charged for the water | 12/12, 0 | green |

Every other anchor in the suite is green. Three tests elsewhere read the old
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

`npm test` 2667 passed / 1 failed (the give-back band) / 152 files ·
`npm run typecheck` clean on all three configs · `npm run lint` clean apart from
the 3 standing `no-console` warnings in `src/ui/`.

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

**Nothing caps supersaturation.** The injected 150 L reaches 10.6–10.8 mg/L at
dusk, 129 % of saturation, and sheds it overnight through the same first-order
gas exchange that filled it. Real tanks past ~120 % lose oxygen as bubbles on
the leaves — pearling — which is a channel the engine does not have. It is the
term that would bend the give-back away from tracking `gross` linearly.

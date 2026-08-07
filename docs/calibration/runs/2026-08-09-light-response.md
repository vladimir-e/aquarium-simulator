# Putting intensity back in the rate: `light-response`

Date: 2026-08-09 · Branch: `light-response` · Roadmap §2, subtask 2c

Light reached photosynthesis exactly once, as a `light <= 0` guard, so 5 PAR and
200 PAR produced identical oxygen. The fix is one term — `tanh(PAR / Ik)`, the
Jassby–Platt photosynthesis–irradiance curve — multiplied into `potentialRate`,
and the same term replacing vitality's flat in-band light award.

Every figure below is an engine run driven through `keep()`, the same loop the
anchors run, at `rngSeed` 4242. The probe is `npm run probe:light-response`.

---

## The constants

| constant | was | is | note |
|---|---|---|---|
| `saturationIrradianceFactor` | — | **2.0 × band low** | new; `Ik` per species |
| `lightRequirement` (species field) | `low`/`medium`/`high` | *deleted* | derivable from the band |
| `co2PerRateUnit` | 30 mg | **30 mg** | re-swept, **did not move** |
| `nutrientsPerPhotosynthesis` | 4.0 | **4.0** | re-checked, did not move |

`Ik` reads anubias 16, java fern 20, amazon sword 40, dwarf hairgrass 50, monte
carlo 60 PAR — inside the published macrophyte range, shade species 10–30 and
sun species 50–150. The deleted tier reproduces exactly off the band (<30 low,
30–<50 medium, ≥50 high), which is the evidence it was always derivable.

## The measurement had to be fixed before the constant could be read

The first sweep of this branch reported the grown-in tank's gross oxygen as a
**mean over every lit hour of the 90-day run**, and read 0.470 at yield 30
against 2b's 0.670 — a 30 % collapse that would have justified moving the yield
to 40. It is an artifact of the statistic, and three things say so: on the
anchor's own planting, which starts settled, the same branch read 0.565 against
2b's 0.581; the probe's own curve-in/curve-out counterfactual moved gross only
4 %; and 4 % cannot produce 30 %.

**The tank grows the whole time.** It starts at 350 total plant size and is
still climbing at day 90 — there is no plateau. The ≈987 it is quoted at is
where the run *ends*, after the monte carlos starve out around day 82 and hand
their biomass back; it is not a settling point. Gross oxygen is very nearly
linear in plant size, so a whole-run mean is a mean over the ramp and describes
a tank of ~790 size, not the grown-in one the observable names.

So the window is taken **on plant size rather than on a day**: the lit hours
whose planting is within 10 % of the size the run finishes at. It is derived
from each run rather than hard-coded, and it is self-checking — on the anchor's
own planting, which is handed 982 at tick 0, it keeps **96 of 96** lit hours and
is therefore inert exactly where it should be.

## The yield sweep, corrected

Grown-in planted 150 L: canister, aqua soil, 90 PAR on a 12 h photoperiod,
carbon 10 h/day, 3 ml/day dosed, ATO, 0.6 g/day fed, 30 % weekly change. Planted
with 3 amazon sword, 4 monte carlo, 2 java fern and 1 anubias at size 35 — 350
total — plus 12 neon tetras, run 90 days. `hours` is the window and `size` the
mean planting across it. Every column is read inside that window: the means
either side of the O₂ pair are per lit hour, and the pair itself is the highest
and lowest any hour of the window closed on, dark hours counted.

| yield | gross O₂ (mg/L/h) | O₂ high | O₂ low | dark give-back | size | hours | fish |
|---|---|---|---|---|---|---|---|
| 10 | 0.212 | 8.92 | 7.48 | 0.51 | 959 | 424 | 12 |
| 20 | 0.400 | 9.64 | 6.84 | 1.04 | 973 | 392 | 12 |
| **30** | **0.569** | **10.28** | **7.42** | **1.43** | **972** | **376** | **12** |
| 32 | 0.603 | 10.40 | 6.91 | 1.53 | 976 | 373 | 12 |
| 35 | 0.650 | 10.57 | 6.58 | 1.65 | 975 | 360 | 12 |
| 40 | 0.726 | 10.84 | 7.15 | 1.82 | 975 | 349 | 12 |
| 45 | 0.796 | 11.09 | 7.04 | 1.95 | 978 | 328 | 12 |
| 50 | 0.868 | 11.33 | 6.10 | 2.15 | 977 | 330 | 12 |
| 57 | 0.962 | 11.64 | 6.61 | 2.31 | 975 | 346 | 12 |
| 60 | 1.002 | 11.76 | 5.75 | 2.43 | 973 | 360 | 12 |
| 80 | 1.234 | 12.50 | 6.10 | 2.80 | 966 | 399 | 12 |

The gross band opens at ≈25.9 and the dark-hours ceiling closes it at ≈46.2. On
the anchor's own planting the same sweep admits **26.2 – 55.9**, against the
25.4 – 54.1 that 2b measured on it — two engines, the same tank, a window whose
edges moved by under two points.

**30 stays.** It sits inside both windows with room either side, it is where
ties break, and nothing in the corrected measurement asks it to move. The
comment on it keeps only what is newly true: a rate unit is now an hour of
100 % plant size at full carbon *and* saturating light.

## Like for like against 2b

Same instrument, same window, shipped 2b (`HEAD`) against this branch, yield 30:

| planting | 2b | 2c | change |
|---|---|---|---|
| grown-in, 90 d | 0.608 | 0.569 | −6.5 % |
| anchor's planting, 10 d | 0.579 | 0.565 | −2.5 % |

Two notes on the comparison. 2b's report records **0.670** for the grown-in row,
where its own shipped engine measures 0.608 under this window — that table
predates the nitrifiers that landed later in the same branch, the way its
lethality table says of itself. Its anchor row does not drift: 0.581 there,
0.579 here, measured across two engines.

And the branch's own counterfactual closes the loop — taking the curve out
reproduces shipped 2b to four significant figures.

## What the curve costs

The same tank, 90 days, with `saturationIrradianceFactor` at 0 (every species
saturates at no light, so the response reads 1 everywhere) beside the shipped 2.0:

| Ik | gross | uptake (mg) | NO₃ ppm | PO₄ ppm | size at 90 d | plants | condition |
|---|---|---|---|---|---|---|---|
| out | 0.608 | 10.57 | 10.98 | 4.36 | 987 | 6 | 100 |
| ×2 | 0.569 | 9.87 | 12.74 | 4.45 | 978 | 6 | 100 |

**On a well-lit tank the light response costs almost nothing — 6 %.** That is
the whole point of a saturating curve: at 90 PAR this planting is at or past
saturation for most of what is in it (java fern reads 1.000 of its maximum,
anubias 1.000, amazon sword 0.978, monte carlo 0.905), so the term it multiplies
by is nearly 1 and there is nothing to take away.

**On a dim tank it costs nearly everything**, which is the defect closing. At
20 PAR at the substrate an amazon sword now runs at 0.46 of its rate and a monte
carlo at 0.32; at 5 PAR a monte carlo runs at 0.08. Before this change all of
those read 1.0 and a 5 W closet tank fixed carbon like a high-tech one.

`nutrientsPerPhotosynthesis` **holds at 4.0**. Uptake falls 6.6 % with gross, so
nitrate settles 10.98 → 12.74 ppm — up, but a healthy planted-tank figure, well
under the 40 ppm where damage starts and the 100 ppm toxicity threshold.
Phosphate barely moves and plant condition is 100 either way. Nothing
misbehaves, so nothing moves.

## The vitality benefit now pays above the band

`main` awarded `lightBenefitPeak` only *inside* `tolerableLight` and nothing
outside it. 2c awards `peak × tanh(PAR / Ik)`, and by the top of any species'
band that term is within a thousandth of 1 — so the award above the band is
effectively the whole peak, 20 % of the benefit budget, paid to a plant that
`lightExcessiveSeverity` is burning at the same time.

What that is worth: 40 L, water held at the optimum the tables above hold it at,
algae shading out of reach, 60 days, against a `lightBenefitPeak: 0` run that
reproduces `main` exactly for these rows.

| species | band high | substrate PAR | this branch | at benefit 0 |
|---|---|---|---|---|
| java fern | 90 | 300 | alive, condition 64.8 | dead d48.3 |
| amazon sword | 120 | 250 | alive, condition 43.2 | dead d40.8 |
| anubias | 70 | 300 | condition 97.7 | condition 52.2 |
| monte carlo | 200 | 300 | dead d46.8 | dead d28.7 |
| anubias | 70 | 100 | size 264.2 | size 232.7 |

It reads this way by design. A plant above its band really is photosynthesising
at its maximum, and the rate carries no photoinhibition term — the harm from too
much light is `lightExcessiveSeverity`'s to charge, on its own channel. The
constant carrying that charge was pinned when this benefit was zero above the
band.

---

## The reachability check

Hold the schedule, hold the water at three times optimal nutrients and optimal
carbon, and raise the fixture. `gross` is read over three days before a bloom can
build; `size60` is what a keeper gets after 60 days; `noAlgae` is the same run
with algae shading out of reach.

**Java fern, Ik 20** — a low-Ik shade species:

| substrate PAR | PAR/Ik | gross | NO₃ draw | size60 | peak algae | noAlgae |
|---|---|---|---|---|---|---|
| 5 | 0.25 | 0.053 | 0.91 | 259 | 59.6 | 344 |
| 10 | 0.50 | 0.102 | 1.74 | 291 | 56.8 | 370 |
| 20 | 1.00 | 0.168 | 2.87 | 311 | 55.2 | 384 |
| 40 | 2.00 | 0.214 | 3.65 | 324 | 54.1 | 394 |
| 60 | 3.00 | 0.221 | 3.77 | 326 | 53.9 | 395.3 |
| 70 | 3.50 | 0.221 | 3.78 | 326 | 53.9 | 395.5 |
| 90 | 4.50 | 0.222 | 3.79 | 273 | 68.3 | 395.6 |

**Monte carlo, Ik 60** — a high-Ik sun species:

| substrate PAR | PAR/Ik | gross | NO₃ draw | size60 | peak algae | noAlgae |
|---|---|---|---|---|---|---|
| 5 | 0.08 | 0.018 | 0.30 | 0 | 76.7 | 255 |
| 15 | 0.25 | 0.057 | 0.97 | 347 | 48.3 | 550 |
| 30 | 0.50 | 0.120 | 2.05 | 948 | 19.1 | 948 |
| 60 | 1.00 | 0.201 | 3.43 | 996 | 18.0 | 996 |
| 90 | 1.50 | 0.240 | 4.11 | 1019 | 24.7 | 1019 |
| 120 | 2.00 | 0.257 | 4.39 | 969 | 35.8 | 1029 |
| 160 | 2.67 | 0.264 | 4.51 | 0 | 92.6 | 1033 |
| 200 | 3.33 | 0.266 | 4.55 | 0 | 94.0 | 1034 |

Production rises and then flattens, on both species, and it flattens where the
curve says it should: java fern gains nothing measurable past 3 Ik (0.221 →
0.222 across 60–90 PAR), monte carlo 0.264 → 0.266 across 160–200. The shade
species is done by 60 PAR; the sun species is still climbing there. **#9 is
closed** — a high-PAR fixture measurably out-produces a low one, and stops
paying.

Growth does the same *once the algae channel is held out*: 395.3 / 395.5 / 395.6
for java fern, 1029 / 1033 / 1034 for monte carlo. Rises, flattens, never falls.

## The deaths at high PAR are algae, and they are correct

`size60` tells a different story from `noAlgae`: monte carlo peaks at 1019 (90
PAR), falls to 969 (120) and reaches **zero** at 160 and 200, the planting dead
by day 28.5. Monte carlo tolerates 30–200 PAR, so the light-excessive stressor is
not firing at 160. Java fern shows the same shape earlier — 326 → 296 → 273
across 70/80/90 PAR.

Measured rather than reasoned about, on the stressor breakdown of every hour of
every run: **`algae` is the only non-zero stressor in the entire table.** Peak
algae mass tracks the deaths exactly — 24.7 at 90 PAR (under the shading
threshold of 30, so no stressor at all), 35.8 at 120, 92.6 at 160.

The counterfactual proves causation rather than correlation. With
`algaeShadingThreshold` lifted out of reach and nothing else changed:

| case | shipped | shading out |
|---|---|---|
| monte carlo, 160 PAR | 0 (dead d28.5) | **1033**, condition 100 |
| monte carlo, 200 PAR | 0 (dead d26.5) | **1034**, condition 100 |
| java fern, 90 PAR | 273, condition 80 | **396**, condition 100 |

So the chain is: high PAR with no matching uptake grows algae → the bloom passes
`algaeShadingThreshold` → the shading stressor takes the planting down. That is
the death spiral the `algae_shading` stressor was built for, and it is what every
keeper who has pointed a big fixture at a tank without the plant mass to use it
has seen. The probe holds nutrients at three times optimal to isolate the light,
which is a permanently replete water column — exactly the condition under which
light alone decides whether plants or algae win.

## The dim end of that curve is an artifact

Peak algae is **U-shaped in PAR** on the monte carlo table — 76.7 at 5 PAR, a
minimum of 17.8 at 70, then 94.0 at 200. The bright arm is a light response.
The dim arm is not: it is the plant side of the comparison moving while the
algae side cannot.

Algae has exactly one light channel. `systems/algae-vitality.ts` gives it the
`excess_light` benefit, `min(peak, severity × (PAR − lightExcessThreshold))`,
which is zero at or below the 70 PAR threshold; `algae/index.ts` gates growth
and surplus on `light > 0`, and nothing else in the population reads intensity.
So below 70 PAR the light is a switch, not a dial. Driven with the plants taken
out and the water held the way the tables above hold it, the same 150 L over
60 days reads that straight off:

| substrate PAR | 1 | 5 | 10 | 20 | 30 | 50 | 69 | 70 | 90 | 120 | 200 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| peak algae | 84.374 | 84.374 | 84.374 | 84.374 | 84.374 | 84.374 | 84.374 | 84.374 | 88.261 | 92.357 | 96.265 |
| crosses shading | d12.5 | d12.5 | d12.5 | d12.5 | d12.5 | d12.5 | d12.5 | d12.5 | d10.5 | d8.5 | d7.5 |

**1 PAR grows algae exactly as fast as 70 PAR**, to the digit, crossing the
shading threshold on the same day. Only past 70 does the curve move.

2c weakens the plants at the dim end — correctly, that is the defect closing —
and weakens algae not at all, so algae wins by default and the hump appears. The
dim-end deaths are algae's too: at 5 PAR the monte carlo planting reaches zero
with shading in and 255 with it out.

The hump's depth is the size of the mismatch, not a property of the light. A
monte carlo (Ik 60) at 5 PAR carries **4.3×** the algae it carries at its 70 PAR
minimum. Two java fern and two anubias at size 35 (Ik 20 and 16) in a low-tech
40 L with six tetras carry **1.09×** theirs across the same stretch — 61.6 at
2 PAR against 56.7 at 50 — the same shape, and all but flat. The bright arm is
the same in both.

## The daily-light-integral trade, re-measured

Java fern, 600 µmol·h of substrate PAR a day, spread four ways:

| substrate PAR | hours | DLI | size60 | peak algae | noAlgae |
|---|---|---|---|---|---|
| 25 | 24 | 600 | 326 | 74.3 | **609** |
| 50 | 12 | 600 | 325 | 53.9 | 395 |
| 100 | 6 | 600 | 235 | 51.7 | 260 |
| 150 | 4 | 600 | 165 | 54.3 | 181 |

Long-and-dim still wins — and now for the right reason. Before 2c it won because
surplus accrued per lit *tick* and intensity did nothing, so hours were the only
lever available. Now it wins because photons above saturation are wasted: at
25 PAR a java fern runs at 0.848 of its maximum for 24 hours, and at 150 PAR it
runs at 1.000 for 4. Twenty hours of useful light against four, and the measured
spread across the table is 3.4×.

(The pre-2c figures in the roadmap — 257 against 153 — are monte carlo at a
different pair of fixtures, and the spec says outright not to calibrate against
them. The claim re-tested here is the direction and its reason, not the ratio.)

---

## Anchors

`tests/planted-gas-budget.test.ts` — the calibration anchor that reads
`co2PerRateUnit` directly — passes unmodified at yield 30, band untouched. All
four permissive anchors stay green.

`npm test` 2661 passed / 152 files · `npx tsc --noEmit` clean · `npm run lint`
clean apart from the 3 standing `no-console` warnings in `src/ui/`.

One thing this branch reverted rather than shipped: `oxygen-limited-draw.test.ts`
had been rewritten from a hard-zero assertion to a share-based one while the
yield was provisionally at 40. At 30 the original assertions pass untouched, so
the rewrite went back. Its one genuinely stale figure — the aerated tank's
tightest margin, which the curve moves — is corrected in place, 3.05 → 2.86 mg/L.

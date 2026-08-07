# Putting intensity back in the rate: `light-response`

Date: 2026-08-09 · Branch: `light-response` · Roadmap §2, subtask 2c

Light reached photosynthesis exactly once, as a `light <= 0` guard, so 5 PAR and
200 PAR produced identical oxygen. The fix is one term — `tanh(PAR / Ik)`, the
Jassby–Platt photosynthesis–irradiance curve — multiplied into `potentialRate`,
and the same term replacing vitality's flat in-band light award.

Every figure below is an engine run driven through `keep()`, the same loop the
anchors run, at `rngSeed` 4242. The probe is `npm run probe:light-response`.

> **Open, and blocking.** The gas reader was measuring an hour out of phase —
> see *The measurement had to be fixed twice* below. Corrected, the admissible
> window for `co2PerRateUnit` closes at **≈25.5** on one planting and **≈26.1**
> on the other, so **30 no longer sits inside it** and
> `tests/planted-gas-budget.test.ts` fails its dark-hours assertion at 2.28
> mg/L against a band of 2. The constant has not been moved and the anchor band
> has not been widened; both are decisions for the maintainer.
>
> Still open after `2026-08-10-plant-respiration.md`, which corrected
> `baseRespirationRate` on the same branch. The give-back turned out not to be a
> respiration measurement — it is 2.145 with respiration at exactly zero — so
> the window only shifted to 21.6–26.2 and 22.4–27.3. The tables below are
> re-read on that engine; the sections they sit in are otherwise as measured.

---

## The constants

| constant | was | is | note |
|---|---|---|---|
| `saturationIrradianceFactor` | — | **2.0 × band low** | new; `Ik` per species |
| `lightRequirement` (species field) | `low`/`medium`/`high` | *deleted* | derivable from the band |
| `co2PerRateUnit` | 30 mg | **30 mg, unresolved** | the corrected band admits 21–26 |
| `nutrientsPerPhotosynthesis` | 4.0 | **4.0** | re-checked, did not move |

`Ik` reads anubias 16, java fern 20, amazon sword 40, dwarf hairgrass 50, monte
carlo 60 PAR — inside the published macrophyte range, shade species 10–30 and
sun species 50–150. The deleted tier reproduces exactly off where the band opens
(<15 PAR low, <25 medium, else high — the same cuts at 30 and 50 in `Ik`), which
is the evidence it was always derivable. The UI reads it off the band, so a
recalibration of the factor cannot move a species' rendered tier.

## The measurement had to be fixed twice

### First: the window

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

### Second: the phase

The window was right and the hour it was taken on was not. `tick()` advances the
clock and settles the light and the equipment *before* it processes plants, so
the state handed to a watcher as `before` still carries the previous hour's
light. The reader classified each hour on it, and computed the plant effects
from it, which put the whole measurement an hour late:

- **dawn** read dark and was dropped, though the tick ran it lit;
- **dusk** read lit and was counted, and `processPlants` was asked for a full
  lit-hour figure on an hour the tick ran in the dark;
- the night ran from the close of 20:00 to the close of 08:00 — eleven dark
  hours and one lit one, instead of the twelve dark hours it names;
- the hour's own CO₂ injection and dosing had not landed yet in the water the
  rate was computed against.

The fix is a seam rather than a correction factor. `settleEnvironment()` is now
the tick's own first stage — clock, passive resources, immediate tier,
equipment — and the reader rebuilds the hour through it, so what it measures is
what the tick ran, by construction rather than by reconstruction.

It is checked behaviourally, in `tests/metrics.test.ts`. Hold every input the
rate reads pinned at the top of each hour so no hour can reach the next, strip
the carbon out of one named hour, and watch whether `gross` moves:

| carbon stripped at | old reader | corrected |
|---|---|---|
| 07:00 (dark) | 0.0000 % | 0.0000 % |
| **08:00 (first lit hour)** | −0.24 % | **−8.53 %** |
| 12:00 (lit) | −8.54 % | −8.55 % |
| 19:00 (last lit hour) | −8.43 % | −8.44 % |
| **20:00 (first dark hour)** | **−8.35 %** | **0.0000 %** |
| 21:00 (dark) | 0.0000 % | 0.0000 % |

−8.5 % is one hour of twelve. The old reader's counted set was 09:00–20:00; the
corrected one is 08:00–19:00, and a dark hour now reaches the reading not at all
— bit for bit. The count per day is 12 either way, which is why `hours` never
noticed.

The same pass fixed a second edge on the same reading: a window opening
mid-night used to take that half-night as a night. The night is now armed at the
hour the lights go out and nowhere else, so a run too short to contain one
reports no give-back rather than a diluted one. On the anchor's 10-day tank the
two corrections separate cleanly — 1.251 as published, 2.052 with the phase
alone, 2.277 with whole nights — and the phase is what carries it past 2. The
corrected figure is exactly the fall from the close of 19:00 to the close of
07:00 read off the run's own hourly trajectory, to twelve decimal places.

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
| 10 | 0.245 | 9.11 | 7.73 | 0.79 | 953 | 399 | 12 |
| 20 | 0.467 | 9.99 | 7.55 | 1.59 | 963 | 400 | 12 |
| **30** | **0.667** | **10.75** | **7.77** | **2.26** | **958** | **384** | **12** |
| 32 | 0.704 | 10.89 | 8.14 | 2.36 | 955 | 384 | 12 |
| 35 | 0.758 | 11.10 | 7.99 | 2.54 | 953 | 386 | 12 |
| 40 | 0.845 | 11.42 | 8.13 | 2.83 | 942 | 374 | 12 |
| 45 | 0.925 | 11.73 | 8.13 | 3.09 | 934 | 329 | 12 |
| 50 | 1.004 | 12.01 | 8.12 | 3.33 | 927 | 292 | 12 |
| 57 | 1.108 | 12.38 | 8.12 | 3.65 | 918 | 228 | 12 |
| 60 | 1.168 | 12.52 | 8.15 | 3.84 | 929 | 151 | 12 |
| 80 | 1.413 | 13.35 | 8.09 | 4.52 | 919 | 156 | 12 |

Swept finer across the edges, the gross floor opens at **≈21.6** and the
dark-hours ceiling closes at **≈26.2** — 26 reads 0.589 gross and 1.986
give-back, 27 reads 0.610 and 2.052. The gross ceiling of 1 mg/L/h is no longer
the binding one; it sits out at ≈49.8, twenty points above where the night
closes the window.

The same sweep on the anchor's own planting — the 982 that
`tests/planted-gas-budget.test.ts` hands over at tick 0, run 10 days — is the
second reading, and the one the window keeps whole:

| yield | gross O₂ (mg/L/h) | O₂ high | O₂ low | dark give-back | size | hours | fish |
|---|---|---|---|---|---|---|---|
| 10 | 0.236 | 9.02 | 8.16 | 0.76 | 1013 | 96 | 12 |
| 20 | 0.452 | 9.87 | 8.16 | 1.51 | 1013 | 96 | 12 |
| **30** | **0.650** | **10.64** | **8.15** | **2.17** | **1014** | **96** | **12** |
| 32 | 0.687 | 10.78 | 8.14 | 2.30 | 1014 | 96 | 12 |
| 35 | 0.742 | 10.99 | 8.14 | 2.48 | 1014 | 96 | 12 |
| 40 | 0.830 | 11.33 | 8.13 | 2.76 | 1014 | 96 | 12 |
| 45 | 0.914 | 11.65 | 8.12 | 3.02 | 1014 | 96 | 12 |
| 50 | 0.995 | 11.95 | 8.11 | 3.27 | 1014 | 96 | 12 |
| 57 | 1.102 | 12.35 | 8.09 | 3.59 | 1014 | 96 | 12 |
| 60 | 1.146 | 12.51 | 8.08 | 3.72 | 1014 | 96 | 12 |
| 80 | 1.409 | 13.45 | 8.03 | 4.48 | 1014 | 96 | 12 |

It admits **≈22.4 – 27.3** — 27 reads 0.593 gross and 1.983 give-back, 28 reads
0.612 and 2.048. Two plantings, two independently derived windows, and they
agree to under a point and a half at both edges: **21.6 – 26.2** and
**22.4 – 27.3**.

**30 does not sit inside either.** It clears the gross band comfortably — 0.667
and 0.650 against 0.5–1 — and it is the night that excludes it, at 2.26 and 2.17
mg/L against a ceiling of 2. Both edges moved for the same reason: the reading
that put 30 mid-band was taken an hour late, and the night it was taken over was
missing a dark hour.

The constant has **not** been moved here. Nothing about the corrected
measurement says what should give — the yield, the ≲2 mg/L ceiling that was
itself only ever read through this reader, or the night side of the engine — and
choosing is a calibration decision rather than a fix.

## Like for like against 2b

This pair was read through the out-of-phase window on both engines, and only the
2c side has been re-read since:

| planting | 2b | 2c, as published | 2c, corrected |
|---|---|---|---|
| grown-in, 90 d | 0.608 | 0.569 | **0.667** |
| anchor's planting, 10 d | 0.579 | 0.565 | **0.650** |

The bias is common-mode — the same reader, the same schedule, two engines — so
the *direction* of the 2c change survives; the levels do not, and the 2b column
needs re-measuring on the corrected reader before the two can be subtracted
again. The branch's own counterfactual, which is measured on one engine and is
in the table below, is the comparison that still stands.

2b's own report records **0.670** for the grown-in row, where its shipped engine
measured 0.608 under this window — that table predates the nitrifiers that
landed later in the same branch, the way its lethality table says of itself.

## What the curve costs

The same tank, 90 days, with `saturationIrradianceFactor` at 0 (every species
saturates at no light, so the response reads 1 everywhere) beside the shipped 2.0:

| Ik | gross | uptake (mg) | NO₃ ppm | PO₄ ppm | size at 90 d | plants | condition |
|---|---|---|---|---|---|---|---|
| out | 0.705 | 12.15 | 12.31 | 4.52 | 988 | 6 | 100 |
| ×2 | 0.667 | 11.50 | 13.77 | 4.62 | 978 | 6 | 100 |

**On a well-lit tank the light response costs almost nothing — 5 %.** That is
the whole point of a saturating curve: at 90 PAR this planting is at or past
saturation for most of what is in it (java fern reads 1.000 of its maximum,
anubias 1.000, amazon sword 0.978, monte carlo 0.905), so the term it multiplies
by is nearly 1 and there is nothing to take away.

**On a dim tank it costs nearly everything**, which is the defect closing. At
20 PAR at the substrate an amazon sword now runs at 0.46 of its rate and a monte
carlo at 0.32; at 5 PAR a monte carlo runs at 0.08. Before this change all of
those read 1.0 and a 5 W closet tank fixed carbon like a high-tech one.

`nutrientsPerPhotosynthesis` **holds at 4.0**. Uptake falls 5.4 % with gross, so
nitrate settles 12.31 → 13.77 ppm — up, but a healthy planted-tank figure, well
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
| 10 | 0.50 | 0.101 | 1.73 | 291 | 56.8 | 370 |
| 20 | 1.00 | 0.168 | 2.87 | 311 | 55.2 | 384 |
| 40 | 2.00 | 0.213 | 3.64 | 324 | 54.1 | 394 |
| 60 | 3.00 | 0.220 | 3.76 | 326 | 53.9 | 395.3 |
| 70 | 3.50 | 0.221 | 3.77 | 326 | 53.9 | 395.5 |
| 80 | 4.00 | 0.221 | 3.78 | 296 | 61.4 | 395.5 |
| 90 | 4.50 | 0.221 | 3.78 | 273 | 68.3 | 395.6 |

**Monte carlo, Ik 60** — a high-Ik sun species:

| substrate PAR | PAR/Ik | gross | NO₃ draw | size60 | peak algae | noAlgae |
|---|---|---|---|---|---|---|
| 5 | 0.08 | 0.018 | 0.30 | 0 | 76.7 | 255 |
| 15 | 0.25 | 0.056 | 0.97 | 347 | 48.3 | 550 |
| 30 | 0.50 | 0.119 | 2.04 | 948 | 19.1 | 948 |
| 60 | 1.00 | 0.200 | 3.41 | 996 | 18.0 | 996 |
| 70 | 1.17 | 0.216 | 3.69 | 1006 | 17.8 | 1006 |
| 90 | 1.50 | 0.239 | 4.08 | 1019 | 24.7 | 1019 |
| 120 | 2.00 | 0.255 | 4.35 | 969 | 35.8 | 1029 |
| 160 | 2.67 | 0.262 | 4.48 | 0 | 92.6 | 1033 |
| 200 | 3.33 | 0.264 | 4.51 | 0 | 94.0 | 1034 |

Production rises and then flattens, on both species, and it flattens where the
curve says it should: java fern gains nothing measurable past 3 Ik (0.220 →
0.221 across 60–90 PAR), monte carlo 0.262 → 0.264 across 160–200. The shade
species is done by 60 PAR; the sun species is still climbing there. **#9 is
closed** — a high-PAR fixture measurably out-produces a low one, and stops
paying.

These two tables barely moved under the phase correction — third decimal only —
because they hold the water at optimum before every tick, so one lit hour reads
much like the next and swapping which twelve are counted changes almost nothing.
Their growth columns come off the run rather than the window and did not move at
all. The reachability finding is untouched by any of the above.

Growth does the same *once the algae channel is held out*: 395.3 / 395.5 / 395.6
for java fern across 60/70/90 PAR, 1029 / 1033 / 1034 for monte carlo across
120/160/200. Rises, flattens, never falls.

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
minimum. Put a planting that matches the light under the same ladder and the
hump nearly disappears: two java fern and two anubias at size 35 (Ik 20 and 16)
in a low-tech 40 L — no injector, no doser, six neon tetras, 0.6 g/day fed and
30 % weekly change, and the water *not* held, because a keeper of shade plants
does not run one replete. 60 days.

| substrate PAR | size60 | peak algae | noAlgae |
|---|---|---|---|
| 2 | 230 | 61.6 | 294 |
| 5 | 244 | 60.3 | 307 |
| 10 | 266 | 58.5 | 326 |
| 20 | 280 | 57.4 | 338 |
| 30 | 286 | 56.9 | 343 |
| 50 | 289 | 56.7 | 346 |
| 70 | 290 | 56.7 | 346 |
| 90 | 240 | 70.4 | 335 |
| 120 | 0 | 85.9 | 284 |

**1.09×** across the dim stretch — 61.6 at 2 PAR against 56.7 at the 70 PAR
minimum — where the sun species carries 4.3× across its own. Same shape, all but
flat.

Past 70 the two tanks agree again: algae's own channel opens, the bloom climbs,
and by 120 PAR it has taken the planting with it — the same death spiral, on
plants that had no trouble at 70. `noAlgae` falls over those last two rows as
well, which is the other channel a fixture that bright turns on: 70 PAR is where
the anubias band closes, so past it `lightExcessiveSeverity` is charging too.

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
`co2PerRateUnit` directly — **fails one of its three assertions** on the
corrected reader: the dark-hours give-back is 2.174 mg/L against a band of 2.
The band has not been widened. Its other two hold, and the one that pins the
instrument holds exactly: the window still keeps **96 of 96** lit hours, because
the phase moved which hours are counted and not how many. Gross reads 0.650,
inside 0.5–1.

The same file's other reader — the one the volume-term and carbon-clamp tests
run on — carried the identical off-by-an-hour and is corrected with it. Every
one of those assertions still passes: they are ratios between tanks, and the
bias was common to all of them. All four permissive anchors stay green.

`npm test` 2667 passed / 1 failed (the give-back band above) / 152 files ·
`npm run typecheck` clean on all three configs · `npm run lint` clean apart from
the 3 standing `no-console` warnings in `src/ui/`.

One thing this branch reverted rather than shipped: `oxygen-limited-draw.test.ts`
had been rewritten from a hard-zero assertion to a share-based one while the
yield was provisionally at 40. At 30 the original assertions pass untouched, so
the rewrite went back. Its one genuinely stale figure — the aerated tank's
tightest margin, which the curve moves — is corrected in place, 3.05 → 2.86 mg/L,
and the respiration pass moved it again to 5.46.

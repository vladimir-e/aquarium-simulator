# Pinning the carbon yield: `gas-volume-stoichiometry`

Date: 2026-08-06 · Branch: `gas-volume-stoichiometry` · Roadmap §2, subtask 2b

Gas deltas became masses converted through the tank's water volume, and the
O₂/CO₂ pair became one reaction rather than two independent coefficients. Four
constants become one: `co2PerRateUnit`, mg of CO₂ per rate unit, read by
photosynthesis and respiration alike. The old values were mg/L per process unit,
so they carry no information forward and the new one had to be measured.

Every figure below is an engine run driven through `keep()`, the same loop the
anchors run, at `rngSeed` 4242.

---

## The constants

| constant | was | is | note |
|---|---|---|---|
| `o2PerPhotosynthesis` | 0.7 mg/L per unit | *deleted* | derives from the carbon |
| `o2PerRespiration` | 0.7 mg/L per unit | *deleted* | derives from the carbon |
| `co2PerPhotosynthesis` | 0.5 mg/L per unit | *deleted* | one reaction, one yield |
| `co2PerRespiration` | 0.5 mg/L per unit | *deleted* | ditto |
| `co2PerRateUnit` | — | **30 mg per rate unit** | measured, below |

The oxygen partner is `× MW_O2 / MW_CO2` = 32/44 off the carbon, so 30 mg of CO₂
carries 21.8 mg of O₂ and the moles match. The old pair claimed 1.92 moles of O₂
per mole of carbon fixed.

Two more coefficients defined molar and applied to mass are corrected in the
same pass: the fish `respiratoryQuotient` (0.8, unchanged — the *conversion*
gained the molar step, so fish now produce 1.375× the CO₂ they did), and aerobic
decay, where `gasExchangePerGramDecay` is now read as an oxygen demand with the
CO₂ derived from it.

## Why 30

A grown-in planted 150 L has to run **0.5–1 mg/L/h of gross O₂ through the
photoperiod** and give back **under ~2 mg/L across the dark hours**. Pinning
that needs to know what total plant size such a tank reaches, which is a
measurement rather than a guess.

The tank: 150 L, canister, aqua soil, 90 PAR on a 12 h photoperiod, CO₂ at 2
bps for 10 h, 3 ml/day dosed, ATO, 0.6 g/day fed, 30 % weekly change. Planted
with 3 amazon sword, 4 monte carlo, 2 java fern and 1 anubias at size 35 — 350
total — plus 12 neon tetras. Run 90 days.

It settles at **≈ 987 total plant size** (the four monte carlos starve out around
day 60 — defect #13, untouched here). That is the tank the yield is pinned on,
and it brackets the 982-size case the roadmap names.

| yield | gross O₂ (mg/L/h) | O₂ high | O₂ low | dark-hours give-back | fish |
|---|---|---|---|---|---|
| 10 | 0.255 | 9.07 | 8.04 | 0.57 | 12 |
| 20 | 0.476 | 9.84 | 7.82 | 1.08 | 12 |
| **30** | **0.670** | **10.51** | **7.59** | **1.48** | **12** |
| 40 | 0.840 | 11.10 | 7.35 | 1.79 | 12 |
| 50 | 0.991 | 11.61 | 7.11 | 2.03 | 12 |
| 60 | 1.124 | 12.06 | 6.87 | 2.20 | 12 |
| 80 | 1.339 | 12.77 | 6.40 | 2.40 | 12 |

20 through 50 all land inside the gross band; 60 and up break the dark-hours
ceiling. **30** sits mid-band on both readings with room on either side, and
ties break low — a planted tank that gasses its fish is the failure this
subtask exists to remove.

**The anchor reads the same claim off a lighter tank and lands lower.**
`tests/planted-gas-budget.test.ts` hands 982 over at tick 0 as two species
rather than growing a four-species planting for 90 days, so at yield 30 it
measures **0.581** gross against the 0.670 here — 13 % apart — and the window it
admits is **25.4 – 54.1** rather than 20 – 50, with 30 sitting 15 % over that
floor and 80 % under that ceiling. Same pinning, two plantings; a
re-derivation off the table above should expect the assertion to move with it.

The day side self-throttles as designed: at 30 the water column sits around 5.7
mg/L of CO₂ against an optimum of 20, so `co2Factor` ≈ 0.29 and the planting
caps its own rate within the hour.

## The extremes, at 30

| case | gross O₂ | O₂ high | O₂ low | dark give-back | fish |
|---|---|---|---|---|---|
| fresh planting, 350 size, 7 d | 0.264 | 9.05 | 7.98 | 0.59 | 12 |
| 982 size, 20 d | 0.693 | 10.52 | 7.49 | 1.49 | 12 |
| 982 size, 60 d (grown to 1357) | 0.724 | 10.44 | 7.28 | 1.53 | 12 |
| jungle: 24 plants at `maxSize`, 19 200 size, 20 d | 0.103 | 2.78 | 1.68 | — | **0** |

A fresh planting barely moves the water, which is right — ten seedlings are not
a planted tank. The jungle suffocates everything, and does so through
respiration rather than through the day side: 24 maxed plants draw ~5.8 mg/L/h
of O₂ around the clock in 150 L, CO₂ piles up to 30 mg/L, and the planting's own
photosynthesis has collapsed to 0.1 mg/L/h because nothing is left to feed it.
That is a tank nobody can build — 2d's footprint budget is what will stop the
player getting there — and the behaviour under it is the volume term working,
not failing.

---

## The volume term

The measurement isolates the planting: the same tank read with and without it,
with carbon, nutrients and the oxygen each hour opens at all held, so surface
exchange cancels out of the difference. The light is held too — the runs use a
water column of zero attenuation, so every tank reads its fixture's full 90 PAR
at the substrate instead of the PAR its own depth implies. 600 total plant size,
whatever the tank around it, and volume the only thing left varying.

Oxygen the planting contributes, mg/L/h:

| tank | 10 L | 20 L | 40 L | 150 L | 300 L |
|---|---|---|---|---|---|
| before | 2.623 | 2.624 | 2.628 | 2.628 | 2.628 |
| after | **8.223** | **4.112** | **2.056** | **0.548** | **0.274** |

Before, a 30× change in volume bought 0.2 %. After, it buys 30.000× — exactly
the ratio the water gives it, at every step. Asserted as a ratio in
`tests/planted-gas-budget.test.ts`, so it survives recalibration.

The assertion runs a lighter probe than the table — 200 total plant size, and
carbon held at three times optimal rather than at it. The ratio is the same to
six decimals either way, but the 10 L is the tank that meets a ceiling first,
and there are two of them: the carbon clamp once an hour's demand outruns the
column, and `OxygenResource`'s own upper bound once the hour's release outruns
the water. At the table's own fixture the first of those sits 11 % away, so a
re-derived `co2PerRateUnit` of 33 would have flattened three volume-ratio
assertions and pointed them at the volume term. The probe now clears both
ceilings across the whole 20–50 band the yield sweep admits.

(The `before` row was read on `main`, where the fixture's PAR was attenuated by
each tank's depth as the measurement then stood. Pinning the light moves these
figures by under 0.1 % — and takes the ratio from 29.93 to exactly 30.)

## The lethality case

> **Superseded in part.** Nitrification became the fourth aerobic consumer after
> this was measured, and it draws from the same water — see
> `2026-08-07-nitrification-on-air.md`. Two *after* rows moved, re-measured on
> the shipped branch: the unaided 150 L reads min O₂ **5.84** rather than 7.35,
> and the unaided 40 L loses the whole roster rather than keeping 10 of it. The
> finding the table is here for is untouched — the floor moves with the water,
> and the 40 L is the tank this planting genuinely threatens.

982 total plant size and 12 neon tetras, fed 0.5 g/day, 20 days.

| tank | equipment | before | after |
|---|---|---|---|
| 150 L | doser + ATO + CO₂ | 12 alive, min O₂ **4.38** | 12 alive, min O₂ **7.51** |
| 150 L | no doser | 8 alive, first death d14.3 | **12 alive**, min O₂ 7.41 |
| 150 L | unaided | 7 alive, first death d10.3 | **12 alive**, min O₂ 7.35 |
| 40 L | doser + ATO + CO₂ | 7 alive, first death d10.3 | **12 alive**, min O₂ 4.83 |
| 40 L | unaided | 2 alive, first death d7.2 | 10 alive, first death d16.3 |
| 300 L | doser + ATO + CO₂ | 12 alive, min O₂ 4.28 | 12 alive, min O₂ **7.92** |

The tell is the *before* column's oxygen floor: 4.04 in a 40 L, 4.38 in a 150 L,
4.28 in a 300 L. The same planting drove the same tank to the same floor at
seven times the volume. After, the floor moves with the water — 4.83 / 7.51 /
7.92 — and the 40 L is the only tank this planting still threatens, which is the
tank where it genuinely would.

---

## Anchors

All four permissive calibration anchors stay green, and the whole suite passes:
`npm test` 2582 passed / 148 files, `npm run typecheck` clean on all three
configs, `npm run lint` clean apart from the 3 standing `no-console` warnings.

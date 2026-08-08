# What darkness costs the tanks that are not dark: `light-deficiency`

Date: 2026-08-12 · Branch: `light-deficiency` against `main` @ `bbe8249`

`2026-08-11-light-deficiency.md` measures the scenarios the mechanic was built
for. This is the empirical gate on the ones it reaches on the way there — a
planted tank on a normal photoperiod, at every volume, every species across its
own band, the shipped presets, and a keeper's ordinary mistake.

Every figure below is `npm run probe:ordinary-tanks`, driven through `keep()`
like the anchors. The probe compiles and runs unchanged on `main`, so every
number has its baseline in the same table. `npm run probe:starvation-share` is
the attribution run and is branch-only — it reads config keys `main` lacks.

**The full suite is green on this branch: 153 files, 2687 tests.** Nothing below
is caught by an existing test.

---

## 1. The feature works — light is a dose now, and it was not

One plant, 40 L, 12 h, every channel but light rewritten to optimum before each
tick, 90 d. Size at day 90; `†` is a run that ended dead.

| species | fixture | PAR | `main` | branch |
|---|---|---|---|---|
| anubias | 0.75 × low | 6 | 87.3 | 53.8 |
| anubias | low | 8 | 89.8 | 61.8 |
| anubias | 1.5 × low | 12 | 91.9 | 72.5 |
| anubias | 2.5 × low | 20 | 94.5 | 85.5 |
| anubias | mid | 39 | 96.2 | 93.9 |
| java fern | 0.75 × low | 7.5 | 120.8 | 62.8 |
| java fern | low | 10 | 125.9 | 78.1 |
| java fern | 2.5 × low | 25 | 133.7 | 117.3 |
| java fern | mid | 50 | 136.4 | 131.3 |
| amazon sword | 0.75 × low | 15 | 191.8 | 47.3, c82.5 |
| amazon sword | low | 20 | 216.0 | 108.9 |
| amazon sword | mid | 70 | 235.0 | 205.6 |
| dwarf hairgrass | 0.75 × low | 18.8 | 247.6 | † d70 |
| dwarf hairgrass | low | 25 | 306.2 | 108.1 |
| dwarf hairgrass | mid | 112.5 | 336.8 | 283.7 |
| monte carlo | 0.75 × low | 22.5 | 276.8 | † d63 |
| monte carlo | low | 30 | 359.1 | 124.0 |
| monte carlo | mid | 115 | 393.9 | 325.2 |

`main` is flat: a monte carlo grows 277 → 394 across a 5× PAR range and never
leaves condition 100 at any of them, including 22.5 PAR — three quarters of its
own minimum. The branch produces a real dose–response and kills the two carpets
below their band. **This is the change working, and it is the whole point.**

The `high` and `1.3 × high` rows of the probe are not evidence either way: the
hold pins nutrients at optimum every tick, so a bright tank feeds algae without
limit and both sides die of algae mass 90+.

Same story across volumes — one planting, one fixture rating, water pinned:

| capacity | substrate PAR | `main` size | branch size | Δ |
|---|---|---|---|---|
| 20 L | 72.6 | 1378.1 | 1110.0 | −19.5 % |
| 38 L | 68.9 | 1374.6 | 1092.1 | −20.6 % |
| 75 L | 64.4 | 1369.6 | 1066.8 | −22.1 % |
| 150 L | 59.0 | 1362.8 | 1031.7 | −24.3 % |
| 300 L | 52.9 | 1353.3 | 983.5 | −27.3 % |

`main` spans 1.8 % across a 15× volume range; the branch spans 11.4 %. Depth
matters now. Condition 100 and no deaths on both sides.

**The price, stated plainly: a healthy tank grows 20–27 % less plant and settles
its bank ~30 % lower (34 → 24 units).** That is the cost of the model, and on
its own it is defensible.

And the extreme that has to stay safe, does: 365 d, mid-band fixture, bank held
full, every species ends at condition 100 with **byte-identical size to `main`**
(anubias 386.2, java fern 468.8, sword 714.4, hairgrass 1002.4, monte carlo
1039.5). Nothing in the change can kill a plant that has no complaint.

---

## 2. The shipped default preset kills the two beginner plants

`planted` is `DEFAULT_PRESET_ID` — 40 L, 90 PAR, 12 h, CO₂ on, no auto-doser.
Planted with 3 java fern + 2 anubias, 6 neons at 0.03 g/day, 90 d.

| keeping | `main` | branch |
|---|---|---|
| as shipped | 308.7, 5 alive, c100 | **80.5, 2 alive — all 3 java ferns dead d55** |
| + 25 % weekly water change | 308.0, 5 alive, c100 | **77.1, 2 alive — ferns dead d54** |
| + auto-doser on | 533.0, 5 alive, c100 | 457.2, 5 alive, c100 |

A water change does not rescue them; switching the doser on does. The `betta`
preset with the same planting goes 298.4 / c100 on `main` to 115.4 / c63.2 on
the branch, **and loses all three java ferns between d90 and d120** — run to 180
days it ends as two anubias.

What charges that java fern, off `buildPlantStressors`, pre-hardiness:

```
branch  d28 12:00  light 68.6  cond 63.8  bank 0  suff 0.030  earns 0.378
        Maintenance=0.061  Starvation=0.061  Nutrient deficiency=0.679
main    d28 12:00  light 68.6  cond 100    bank 7.3  suff 0.016  earns 0.401
                                            Nutrient deficiency=0.690
main    d28 00:00  light 0     cond 100    bank 6.9  suff 0.015  earns 0.301
                                            Nutrient deficiency=0.690
```

`main`'s third line is register defect #37 itself: **0.301 %/h earned at
midnight in a tank whose nutrient sufficiency is 1.5 %.** That floor is what was
holding the fern up, and removing it is correct.

But the number that kills it is `Nutrient deficiency = 0.69`, and that constant
is unchanged from `main`. Post-hardiness the fern pays 0.242 %/h around the
clock and earns 0.378 for twelve hours of it — −1.28 %/day, dead from 100 in 55
days. **The branch does not introduce this severity; it removes the thing that
was hiding it.** The implementer flagged `nutrientDeficiencySeverity` as
out-of-scope and owned by §9. This run says the blast radius is not scenario 02
variant B — it is the shipped default preset and the two plants every beginner
guide names.

---

## 3. Scenario 02 variant A: every fish dies

38 L as `docs/calibration/scenarios/02-planted-equilibrium.md` specifies it,
5 plants, 10 neon tetras, 0.05 g/day, 1 ml/day dosed, 90 d. Identical on rng
seeds 5, 1234 and 4242.

| | `main` | branch |
|---|---|---|
| planting at d90 | 424.9 | 299.7 |
| mean condition | 100 | 50.9 |
| bank | 29.7 | 0 |
| monte carlos | died d71 | died d69 |
| **fish** | **10 of 10 alive** | **0 of 10 — all lost d81.3–d83.3** |
| NO₃ | 32.4 ppm | 58.9 ppm |
| algae | 5.6 | 45.4 |

The chain, from the day-by-day trace: the branch's planting reaches 335 at d56
where `main` reaches 521. A planting a third smaller consumes a third less
nitrate against the same doser, so NO₃ crosses `nitrateStressThreshold` (40 ppm)
around d70 instead of settling at 27. Algae, which `main` starves out entirely
by d56, crosses `algaeShadingThreshold` (30) on d56.5 and takes the surviving
sword from condition 100 to 30.9. Less plant, more nitrate, more algae, less
plant. Every neon is gone inside 48 hours at 46–58 ppm NO₃, ammonia 0, O₂ 6–12.

The implementer's note has this as "fish lost by d81, second-order, belongs to
whichever pass re-derives the nutrient severities." Confirmed as to the day, and
it is the whole roster rather than some of it.

Variant B, undosed, is worse in the plants: `main` keeps sword and fern at
condition 100 for 90 days (size 251.9); the branch loses both swords on d24 and
ends with one java fern at size 94.6.

---

## 4. The interaction nobody scoped: a shared bank means a second damage channel

Light held at 2 × the species' band low — bright enough that the light channel
has no complaint at all — with one *other* channel taken away and held away.

| species | deprived | `main` | branch |
|---|---|---|---|
| anubias | nutrients | 63.5, c100 | **died d85** |
| java fern | nutrients | 76.1, c100 | **died d51** |
| amazon sword | nutrients | 35.0, c74.3 | **died d16** |
| dwarf hairgrass | nutrients | died d25 | died d10 |
| monte carlo | nutrients | died d25 | died d10 |
| anubias / java fern | CO₂ | unchanged | unchanged |
| sword / hairgrass / monte carlo | CO₂ | d5 / d1 / d1 | d5 / d1 / d1 |

The CO₂ column is a clean null — the CO₂-insufficient stressor already kills in
days on both sides, so there is nothing for starvation to add. (That
sword/hairgrass/monte carlo die on day 1–5 of a CO₂ outage is a `main` defect,
unchanged here.)

The nutrient column is the finding: **for anubias and java fern the interaction
converts 90 days of survival into death.**

### And it fires on a transient, not just a permanent one

A perfect bright tank, one outage starting at day 14, the tank put right after.
Condition and size at d90:

| species | days out | `main` | branch |
|---|---|---|---|
| amazon sword | 7 | c100, 211.4 | c100, 136.2 |
| amazon sword | 14 | c100, 195.0 | c100, 79.1 |
| amazon sword | 21 | c100, 179.3 | **died d29** |
| dwarf hairgrass | 7 | c100, 288.6 | c100, 136.0 |
| dwarf hairgrass | 14 | c100, 257.0 | **died d24** |
| dwarf hairgrass | 21 | c100, 224.8 | **died d24** |
| monte carlo | 7 | c100, 338.0 | c100, 156.0 |
| monte carlo | 14 | c100, 300.3 | **died d24** |
| monte carlo | 21 | c100, 261.9 | **died d24** |

On `main` a three-week fertiliser outage is fully recoverable for every species.
On the branch a **fortnight** kills both carpets outright, and they die on day 24
— *before the outage ends*. The cliff for a carpet sits between 7 and 14 days
without ferts, which is one holiday.

Anubias and java fern recover from all four outage lengths on both sides.

---

## 5. Which half is doing it

`npm run probe:starvation-share`, branch-only: `shipped` is both new terms,
`no starvation` zeroes `starvationMultiplier`, `no upkeep` zeroes
`maintenanceCost` and takes starvation with it, leaving only the income change.
The income change cannot be switched off from config, so `no upkeep` is the
floor this reaches; the gap from there to `main` is code.

**14 d outage** — the pair is not the killer:

| species | shipped | no starvation | no upkeep | `main` |
|---|---|---|---|---|
| amazon sword | 79.1 | 116.5 | 146.9 | 195.0 |
| dwarf hairgrass | died d24 | died d25 | died d27 | c100, 257.0 |
| monte carlo | died d24 | died d25 | died d27 | c100, 300.3 |

**Planted preset, fern + anubias** — same:

| variant | java ferns |
|---|---|
| shipped | died d55 |
| no starvation | died d67 |
| no upkeep | died d88 |
| `main` | alive, c100 |

**Scenario 02 variant A** — the opposite:

| variant | size | fish | NO₃ | algae |
|---|---|---|---|---|
| shipped | 299.7 | 0 | 58.9 | 45.4 |
| no starvation | 348.2 | 1 | 55.6 | 35.0 |
| no upkeep | 426.2 | **10** | 33.6 | 25.9 |
| `main` | 424.9 | 10 | 32.4 | 5.6 |

So the two halves fail in different regimes:

- **Water bad → the income change kills.** Zeroing both new stressors moves a
  carpet's death by three days and a java fern's by a month; neither survives.
  What kills is that a stressed plant now earns nothing for twelve hours a day
  against a `nutrientDeficiencySeverity` calibrated when it earned 0.3 %/h.
- **Water good → the maintenance/starvation pair kills.** In the dosed scenario
  02, switching the pair off restores the planting to `main`'s size and saves
  every fish. The 24/7 upkeep is what costs the well-run tank its 30 % of
  planting, and 30 % of planting is what the nitrate budget did not have spare.

---

## 6. A new plant's reserve buys about a week of looking fine

Seeded plants and `addPlant` both hand over `surplusCap / 2` = 25 units. Under a
fixture too dim for the species, water otherwise perfect:

| species | PAR | bank empty | condition slips | died |
|---|---|---|---|---|
| amazon sword | 10 | d8.3 | d8.3 | d65 |
| amazon sword | 15 | d19.2 | d19.2 | — (c75 at d120) |
| dwarf hairgrass | 12.5 | d5.5 | d5.5 | d34 |
| monte carlo | 15 | d5.0 | d5.0 | d30 |
| monte carlo | 22.5 | d8.8 | d8.8 | d63 |

Five to nineteen days at condition 100 before the first sign. On `main` every
one of these rows reads condition 100 at day 120 with no bank at all, so the lag
is new and the signal it delays is new too. Not a defect — worth knowing that
the tank tells the player nothing for the first week.

---

## 7. A `main`-written save silently loses the player's tuned config

`PERSISTENCE_VERSION` is still 22 on this branch, but `PlantsConfigSchema` is
`.strict()` and moved: three keys added, `lightBenefitPeak` removed. A v22 save
written by `main` therefore passes the version gate and then fails the schema:

```
plants.maintenanceCost: expected number, received undefined
plants.starvationMultiplier: expected number, received undefined
plants.starvationReserveHours: expected number, received undefined
plants: Unrecognized key: "lightBenefitPeak"
```

`loadState` falls back to per-section validation, so the tank loads and the
`tunableConfig` section is dropped — the player's tuning reverts to defaults with
a `console.warn` and nothing on screen. The version literal exists to catch
exactly this shape of change.

---

## What this run does not settle

- **`nutrientDeficiencySeverity` now has to move with this change, not after
  it.** Its 0.69 %/h was survivable against a 0.4 %/h floor that no longer
  exists. §4 and §5 both land on it. Whether the fern in §2 *should* die in a
  tank with 1.5 % nutrient sufficiency is a calibration question — but it should
  not be answered by a constant nobody re-derived.
- **The algae competition flipped and nothing measures it.** `main` starves
  algae out of scenario 02 A by day 56; the branch lets it reach 45. Every table
  here reads algae as a symptom. It is also an input, through
  `algaeShadingSeverity`, and the loop between them is unpinned.
- **No anchor covers a planted tank over 90 days with plants that can die.**
  `seeded-tank.test.ts`'s 90-day run is unplanted; its planted run is 30 days
  with heavy feeding and weekly water changes. That is why 2687 green tests sit
  alongside §2 and §3.

# One reserve, two claims, and the severity that was hiding behind the old income

Date: 2026-08-14 · Branch: `light-deficiency`, against the same branch @ `06c9950`
("before") and `main` @ `bbe8249`

Three probes, unchanged seeds: `npm run probe:ordinary-tanks`,
`probe:dark-tank`, `probe:starvation-share`. `main`'s column is the same
`ordinary-tanks` and `dark-tank` sources run in a `main` worktree with the two
lines that read `buildPlantUpkeep` dropped — every other figure is the same code
on both sides. `starvation-share` is branch-only.

**Suite green: 153 files, 2688 tests.**

---

## 1. The reserve, restored by priority rather than by separation

### The naive ordering was tried first, and it is the failure the severing was for

"Upkeep has first claim, damage takes what's left" read as a *within-tick*
sequence buys exactly one tick. Damage outweighs upkeep by 5–20×, so the bank
damage empties this hour is the bank upkeep finds empty the next, and the plant
sheds. Measured, against the severed branch head:

| | before (severed) | naive ordering |
|---|---|---|
| scenario 02 A, 90 d | 337, 10 of 10 fish | **0 plants, 0 fish** — every neon gone by d43 |
| `planted` preset, fern + anubias | ferns d68 | **ferns d30** |
| 7 d CO₂ outage, sword | recovers, 136 | **dies d18** |
| 3 d CO₂ outage, carpets | recover | **die d15** |

That is the previous unit's finding reproduced, and worse. Ordering alone does
not close it.

### What does close it: the reserve is a stock, so first claim is a reservation

`upkeepReserveHours` — the constant that used to be the line
`starvationMultiplier` ramped against — becomes the depth damage may not reach.
Upkeep spends the bank to the last unit; damage spends only what stands above
`upkeepRate × upkeepReserveHours`. One line, one meaning, and it lets one bank
serve two claims without separating them.

`probe:starvation-share` now measures the line directly — `no reserve` is
`upkeepReserveHours` 0, which is the naive ordering:

**14 d fertiliser outage, bright tank, size at d90**

| species | shipped | no reserve | no upkeep |
|---|---|---|---|
| anubias | 75.8 | 75.8 | 80.4 |
| java fern | 100.4 | 100.4 | 109.5 |
| amazon sword | 143.3 | 105.3 | 173.5 |
| dwarf hairgrass | **124.4** | **died d26** | 230.8 |
| monte carlo | **146.4** | **died d27** | 269.2 |

Scenario 02 A: the monte carlos go d78 with the line and d59 without it. The
`planted` preset is identical either way — a tank whose plants never run their
spare down does not care where the floor is, which is the null the line should
produce.

### Both readings survive

`preset-why`, the `planted` preset's java fern, one row a week:

```
before  d 7 00:00  cond  99.1  bank 11.20
        d14 00:00  cond  96.4  bank  5.64      condition falls, bank parks
after   d 7 00:00  cond 100    bank 12.42
        d14 00:00  cond 100    bank  7.11      bank falls, condition holds
```

Condition 100 with a draining bank is the "burning reserves" signal, and it is
back. So is the null at the other end: anubias under a fixture 1.3× past its
band now ends at **condition 100 with the bank drawn 26.1 → 14.3**, where the
severed version read 99.6 with the bank untouched.

And the extreme that has to stay safe still is: the 365 d full-bank run ends
every species at `main`'s size **to the decimal** — 386.2 / 468.8 / 714.4 /
1002.4 / 1039.5 — and the five-volume sweep moves in the fourth significant
figure (1110.0 → 1110.1).

---

## 2. `nutrientDeficiencySeverity` 0.7 → 0.3

**Model-changed re-derivation.** The old value was quoted against an income
that paid 0.4 %/h in the dark; the light term removed that income and its
docstring's reference — "monte carlo bottoms out at 30–55 by day 28 rather than
dying" — became day 4. The sweep below is nine values across five scenarios;
the scaffold that produced it was deleted with the derivation.

### The severe end — permanent, total deprivation, bright tank, 180 d

`cN` is alive at condition N.

| severity | anubias | java fern | sword | hairgrass | monte carlo |
|---|---|---|---|---|---|
| 0.20 | c80.2 | c53.8 | d152 | d81 | d81 |
| 0.25 | c72.3 | c41.7 | d125 | d51 | d51 |
| **0.30** | **c63.3** | **c28.1** | **d85** | **d19** | **d19** |
| 0.35 | c53.0 | c11.1 | d59 | d13 | d13 |
| 0.45 | c28.2 | d169 | d23 | d12 | d12 |
| 0.70 | d111 | d67 | d12 | d12 | d12 |

A carpet with no nitrogen at all melts in weeks, not months: 0.20 gives it
eleven weeks, 0.30 gives it under three. Below 0.30 the severe end stops being
severe.

### The marginal end — the tanks a player actually presses, undosed, 180 d

`planted` and `betta` are shipped presets; `planted` is `DEFAULT_PRESET_ID`.
Both planted with 3 java fern + 2 anubias, no doser, no water changes.

| severity | `planted` 40 L | `betta` 20 L |
|---|---|---|
| 0.30 | 381.3, **5 alive, c100** | 224.1, **5 alive, c95.8**, fish alive |
| 0.35 | 333.1, 5 alive, c100 | 210.9, 5 alive, **c70.9** |
| 0.40 | 284.2, 5 alive, c100 | 86.2, **ferns d173**, **fish dead** |
| 0.50 | 219.9, 5 alive, **c66.3** | ferns d91, fish dead |
| 0.70 | 101.7, **ferns d64** | ferns d46, fish dead |

The two most bombproof plants in the hobby, in the default preset, with a keeper
who does nothing. They have to live. That binds the value at or under 0.35, and
the nano's fish — which dies in the ammonia spike three dead ferns make in 20 L
— binds it at 0.30.

### Between the ends there is a real dose–response

Monte carlo at 0.30, water held at a share of every optimum, 180 d:

| share of optimum | sufficiency | outcome |
|---|---|---|
| 1.0 | 1.00 | thrives |
| 0.5 | 0.50 | died d149 |
| 0.25 | 0.25 | died d74 |
| 0.10 | 0.10 | died d46 |
| 0 | 0 | died d19 |

Five months at half nutrition, ten weeks at a quarter, six at a tenth, three at
nothing. Every point on that line is a tank a keeper would recognise.

### The one claim 0.30 does not satisfy, and why it isn't the severity's

**A monte carlo at half of every optimum should not die at all**, and at 0.30 it
dies on d149. But "half of every optimum" is 7.5 ppm NO₃ — an ordinary
lightly-dosed planted tank, which the engine scores at sufficiency **0.500**:

| share | NO₃ ppm | anubias / fern | sword | carpets |
|---|---|---|---|---|
| 0.50 | 7.5 | 1.000 | 0.833 | **0.500** |
| 0.25 | 3.75 | 0.833 | 0.417 | 0.250 |
| 0.10 | 1.5 | 0.333 | 0.167 | 0.100 |

Sufficiency is linear below `optimalNitratePpm` with no saturating headroom, so
a normal tank reads half-starved for a high-demand species. Satisfying this
claim needs severity ≤ 0.20, which forfeits the severe end entirely (a carpet
in barren water would take eleven weeks). **The mis-shape is in the sufficiency
curve, not in the severity** — it wants to be saturating, the way every other
rate in this engine now is — and that belongs to whichever pass takes
`nutrients.ts`. Filed, not fixed.

### What 0.30 moves

`compound` — bright light, one channel taken away and held away, 90 d:

| species | `main` | before | after |
|---|---|---|---|
| anubias | 63.5, c100 | 36.5, **c50.7** | **53.4, c100** |
| java fern | 76.1, c100 | **died d70** | **58.7, c100** |
| amazon sword | 35.0, c74.3 | died d15 | **died d85** |
| dwarf hairgrass | died d25 | died d12 | **died d19** |
| monte carlo | died d25 | died d12 | **died d19** |

`transient` — a good tank, one fertiliser outage at day 14, size at d90:

| species | days out | `main` | before | after |
|---|---|---|---|---|
| amazon sword | 14 | 195.0 | 70.4 | **143.3** |
| amazon sword | 21 | 179.3 | **died d30** | **130.2** |
| dwarf hairgrass | 14 | 257.0 | **died d25** | **124.4** |
| dwarf hairgrass | 21 | 224.8 | died d25 | **died d35** |
| monte carlo | 14 | 300.3 | **died d25** | **146.4** |
| monte carlo | 21 | 261.9 | died d25 | **98.8** |

A fortnight without ferts is survivable for the whole roster again, and costs a
carpet half its size. Three weeks costs a dwarf hairgrass its life. `main` has
no cliff at all here; the branch's is now at three weeks rather than at one.

`presets` — the same fixture, 90 d, against `main`:

| preset + planting | `main` | before | after |
|---|---|---|---|
| `planted` fern+anubias | 308.7, 5, c100 | **84.8, 2** (ferns d68) | **292.1, 5, c100** |
| `planted` +weekly WC | 308.0, 5, c100 | 80.3, 2 (ferns d66) | 291.6, 5, c100 |
| `planted` +doser | 533.0, 5, c100 | 453.9, 5 | 513.3, 5, c100 |
| `betta` fern+anubias | 298.4, 5, c100 | **85.1, 2, 0 fish** | **210.9, 5, 1 fish** |
| `community` fern+anubias | 516.1, 5 | 470.7, 5 | 477.7, 5 |
| `angelfish` fern+anubias | 441.1, 5 | 294.4, 5 | 401.1, 5 |

Scenario 02 variant A: 367.6 at d90 with **all ten neons alive** on all three
rng seeds (`main` 424.9 / 10 alive; the severed head 337 / 10). Its two monte
carlos still go — on d78 here, d70 on `main`, so that death is not this
branch's. Variant B keeps its sword and fern to d90 (88.3 / 100 condition)
where `main` keeps both at c100 and the severed head lost both.

**No calibration anchor was widened, conditioned, or edited.** None broke: the
whole suite is green on the shipped defaults, which is also the finding the
previous run left open — no anchor covers a planted tank over 90 days with
plants that can die, so nothing in the suite was ever going to notice any of
this.

---

## 3. `starvationMultiplier`, deleted

The previous run found it inert: shedding reads the *share* of the bill left
standing, so the multiple cancels out of the melt and 0 → 3 moved a blackout
death by one day in forty.

The reserve line made it worse than inert. `upkeepRate` is what the line is
quoted on, and starvation was *in* `upkeepRate` — so a plant dipping below the
line paid more upkeep, which raised the line, which put it further below. With
the line in and the multiple still at 1, scenario 02 A goes from ten neons to
none:

| scenario 02 A | multiplier 1 | multiplier 0 |
|---|---|---|
| planting at d90 | 81.9 | **341.7** |
| plants alive | 1 of 5 | 3 of 5 |
| fish | **0 of 10** | **10 of 10** |

It is a second, ad-hoc encoding of "the bank is below the line" sitting next to
the line itself. Gone: the config key, its `plantsConfigMeta` row and debug
slider, the save schema field, three docstrings, and `starvation-share`'s
middle variant — replaced by `no reserve`, which measures the thing that
actually decides.

`starvationReserveHours` survives with the meaning item 1 gave it, and is
renamed `upkeepReserveHours` to say so.

**What the deletion moves on its own**, and it is the direction the design doc
asks for. Starvation charged a thin-banked plant extra, which pushed the whole-
day break-even fixture up ~17 %:

| species | `holds above`, before | after |
|---|---|---|
| anubias | 3.3 PAR | 2.5 |
| java fern | 5.1 | 3.7 |
| amazon sword | 16.2 | 13.1 |
| dwarf hairgrass | 24.2 | 20.3 |
| monte carlo | 29.3 | 25.0 |

So a monte carlo on a 6 h photoperiod now lives — size 80.6, condition 100,
bank 4.0 — where it died on d52, and a dwarf hairgrass on 4 h lives at 53.4.
Marginal, not dead, which is *What Vlad tests* #6: "shorten the photoperiod
instead of killing it — growth should slow, not the planting die." The
hour-for-hour compensation point (`net = 0`) is untouched at 0.103–0.358 × Ik,
because it was never the multiple's.

The blackout, which is what the mechanic was built for, is unmoved: every
species still dies in permanent darkness, one to two days later than before
(anubias d60, java fern d51, sword d31, hairgrass d23, monte carlo d23; from
d59 / d49 / d30 / d22 / d22). The melt trace is the same shape — the bank
drains for seven days at condition 100, then the size goes:

```
d30  size 81.4  cond 100.0  bank 8.4      lights off
d36  size 81.4  cond 100.0  bank 1.1
d37  size 78.3  cond 100.0  bank 0.0      the bill goes unpaid
d40  size 18.3  cond 100.0  bank 0.0
```

---

## 4. Save versions: one branch, one bump

`PERSISTENCE_VERSION` claimed 22 → 23 → 24 for a branch nobody has loaded a
save from. v23's shape never left a developer's machine, so there is no reader
of it to describe. Collapsed to a single v22 → **23** covering the whole
branch: `PlantsConfig` gains `maintenanceCost` and `upkeepReserveHours`, drops
`lightBenefitPeak` and `sheddingConditionThreshold`. `SESSION_VERSION` already
treated the branch as one bump (9 → 10) and is unchanged.

---

## 5. The other plant severities, unmasked or not

Every one of them is quoted as a multiple of the 0.5 %/h benefit budget, and
that budget used to be paid around the clock. It now averages ~0.19 %/h over a
12 h day, so the whole family is over-scaled by roughly the same factor.
Measured, only one of them bites:

**`co2InsufficientSeverity` = 1.5 is broken, and it is not this branch's.** At
CO₂ 3 mg/L a monte carlo (band low 10) is charged `1.5 × 7 × 0.7` = **7.35 %/h
— 176 points a day**, fifteen times the whole benefit budget. `compound` reads
d1 for both carpets and d5 for the sword, **identically on `main`**, so the
income change did not unmask it: it was always this. Its own docstring names
the reference — "loses visible condition within ~24 sim hours when CO₂ falls
from 20 to 5" — which a 5 mg/L gap satisfies thirty times over, so the constant
is 5–10× its own stated referent. Not moved here: it needs its own both-ends
pin (a diurnal CO₂ dip against a bottle that ran out), and moving two severities
in one unit would make neither attributable.

**Over-scaled but not measured biting**: `phStressSeverity` 3.0 (a 0.5-unit
excursion is 3× the budget), `temperatureStressSeverity` 0.4 (a 5 °C excursion
is 4×), `algaeShadingSeverity` 0.05 (a 60 % bloom is 3×, and its own comment
says "calibration-grade — task 42 first-pass"). None of them fire in a tank
whose equipment works, so nothing here moves them. `nutrientToxicitySeverity`
is fine — 40 ppm past the 100 ppm ceiling is 0.4 %/h.

The algae competition flipped on this branch and still nothing measures it:
`main` starves algae out of scenario 02 A by d56, this branch lets it reach 27
(down from 35.9 severed, against `main`'s 5.6). Every table here reads algae as
a symptom; it is also an input, through `algaeShadingSeverity`, and the loop
between them is unpinned. Out of scope by construction — biomass is going into
the Beer–Lambert exponent.

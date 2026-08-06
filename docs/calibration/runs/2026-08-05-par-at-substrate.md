# Empirical validation: `par-light`

Date: 2026-08-05 · Branch: `par-light` · Engine unchanged by this pass

Light moved from fixture watts to **PAR at the substrate**, Beer–Lambert
attenuated through the tank's own height. Every number below is a measured
engine run driven through `src/simulation/tests/metrics.ts` — the same
`keep()` loop the anchors run — with a named `rngSeed`, so each row is
reproducible rather than retold.

Branch health at the time of writing: `npm run typecheck` clean on all three
configs, `npm test` 2513 passed / 144 files, `npm run lint` 0 errors and the
3 standing `no-console` warnings.

---

## 1. The headline: the default tank went from lethal to healthy

A pinned probe — nutrients, CO₂, pH and temperature held at optimum before
every tick, so the light channel is the only thing that moves. 40 L, canister
filter, aqua soil, full lid, ATO, CO₂ on, the shipped default fixture, one
plant at size 35, 60 days, seed 5:

```bash
npm run probe:default-fixture-survival
```

On `main` the default fixture was 100 W. On the branch it is 50 PAR at the
surface, which lands **38.1 PAR** on the floor of a 40 L box (27.1 cm deep).

| species | band | `main` (100 W) | branch (38.1 substrate PAR) |
|---|---|---|---|
| anubias | 8–70 | size 22 / cond 11 | **size 68.3 / cond 100** |
| java_fern | 10–90 | dead d56 | **size 88.8 / cond 100** |
| amazon_sword | 20–120 | dead d44 | **size 141.6 / cond 100** |
| dwarf_hairgrass | 25–200 | dead d42 | **size 195.8 / cond 100** |
| monte_carlo | 30–200 | dead d44 | **size 224.9 / cond 100** |
| algae at d60 | | 71–73 | **0.00–0.12** |

Every species now sits inside its tolerance band on the default tank, and the
one that used to survive limps no longer. The `main` column killed four of
five plantings inside two months on a tank a player gets by pressing nothing.

The `main` figures were measured on a `main` worktree during the empirical
pass; the branch column is what the committed probe prints.

---

## 2. Depth is the mechanic, and it behaves

PAR surviving the column, as a share of the fixture's rating:

| tank | 5 L | 40 L | 500 L |
|---|---|---|---|
| kept at the substrate | **87.3 %** | **76.2 %** | **53.3 %** |

Strictly non-increasing in volume over 1–1000 L at 1 L granularity — no step,
no inversion, no volume at which a bigger tank lands more light.

Substrate PAR the shipped presets actually run on:

| preset | litres | height cm | fixture | at substrate |
|---|---|---|---|---|
| bare | 40 | 27.1 | off | **0** |
| betta | 20 | 21.5 | 25 | **20.155** |
| planted | 40 | 27.1 | 90 | **68.605** |
| community | 150 | 42.2 | 50 | **32.796** |
| angelfish | 300 | 53.1 | 50 | **29.391** |

The 30 % gap between what the equipment list prints and what the tank runs on
is the whole point of the branch, and it is largest exactly where a keeper
would not expect it — the 300 L loses nearly half its fixture to water.

---

## 3. Where `lightExcessThreshold` belongs

`algaeVitalityDefaults.lightExcessThreshold` is 70 substrate PAR. A reviewer
asked for a test pinning the `planted` preset (68.605) under that line,
calling the 1.4 PAR margin the only thing between the default preset and a
permanent algae bloom. **It isn't, and the test would encode a false
invariant.**

Same tank throughout, fixture solved backwards so substrate PAR hits each
target exactly (`src/simulation/tests/par-dose-response.ts`), 40 L, 90 days,
seed 4242, top-off only. Samples are taken at noon, so the last one a 90-day
run reaches is day 89's — the columns say what they read.

Planted — 2 amazon sword, 2 monte carlo, 1 java fern, all at size 35:

| substrate PAR | excess-light %/h | algae d30 | algae d60 | algae d89 | plants left |
|---|---|---|---|---|---|
| 40 | 0.000 | 5.26 | 13.42 | **20.63** | 1 |
| 50 | 0.000 | 5.26 | 13.42 | **20.63** | 1 |
| 60 | 0.000 | 5.26 | 13.42 | **20.63** | 1 |
| 65 | 0.000 | 5.26 | 13.42 | **20.63** | 1 |
| 68.6 (shipped) | 0.000 | 5.26 | 13.42 | **20.63** | 1 |
| 70 | 0.000 | 5.26 | 13.42 | **20.63** | 1 |
| 72 | 0.008 | 6.30 | 15.59 | **23.70** | 1 |
| 75 | 0.020 | 7.88 | 18.79 | **28.11** | 1 |
| 80 | 0.040 | 10.59 | 23.96 | **34.99** | 1 |
| 90 | 0.080 | 16.14 | 33.64 | **47.08** | 1, cond 60 |
| 100 | 0.120 | 22.18 | 42.70 | **61.89** | **0** |
| 114.3 | 0.177 | 29.98 | 55.27 | **75.57** | **0** |
| 126 | 0.224 | 36.54 | 64.68 | **82.22** | **0** |

The 4-of-5 loss in the right-hand column is not the light channel and not a
contradiction of §1: this tank is never dosed, so the same
`nutrient_deficiency` that drives the flat 20.63 baseline below takes the two
monte carlo by d17 and the two amazon sword by d63 at every light level,
including the ones where the light term is exactly zero. §1 pins that channel;
§3 deliberately leaves it free.

Three things this settles:

1. **Below the line the light channel contributes exactly nothing.** 40 PAR
   and 70 PAR give byte-identical algae. The 20.63 at the shipped setting is
   `nutrient_deficiency` plus `low_plant_power` in an undosed tank — not
   light. A margin of 1.4 PAR against a term that is zero on both sides of it
   is not a margin against anything.
2. **Crossing it is a soft knee.** The stressor is
   `min(0.4, 0.004 × (PAR − 70))` %/h, so the first PAR over the line buys
   0.004 %/h. An A/B either side at the same volume — an 88 PAR fixture
   (67.1 substrate) against a 92 (70.1) — reads **20.63 vs 20.83** algae at
   d89. There is no cliff at 70 to fall off.
3. **The destructive zone starts near 100, not 70.** At 100 substrate PAR the
   planting is wiped out by d78; at 90 it survives at condition 60. That is
   where a warning would be worth writing, and it is 30 PAR above the
   threshold.

**No test was added pinning `planted` under 70.** It would fire on harmless
changes — a preset moved from 40 L to 45 L, a fixture nudged one tier — while
the outcome it claims to protect (an algae bloom) does not depend on the line
at the shipped configuration. What the measurement bought instead is a
corrected comment on the constant itself.

Empty tank, same sweep, for contrast — every lit tank with nothing in it grows
algae regardless of the threshold:

| substrate PAR | 40–70 | 80 | 100 | 126 |
|---|---|---|---|---|
| algae d89 | **59.85** | 67.61 | 78.92 | 87.95 |

Driven by `low_plant_power`, which is arguably right for an empty lit tank.
Pre-existing, unchanged by this branch.

---

## 4. Livestock is untouched where light cannot reach it

Same seed, 90 days, `main` against the branch: **bit-identical** — same death
days to three decimals — for every run in which light plays no part, and
better wherever it does, through the plant channel. The branch changes what
the light resource *means*; it does not change any path a fish reads.
(Measured during the empirical pass against a `main` worktree; not re-run
here, since no engine behaviour changed after it.)

---

## 5. Known, deliberate, or out of scope

Named so a future pass does not read them as regressions from this one. All
reproduce identically on `main`.

- **A plant in an unlit tank is immortal and frozen.** Size unchanged,
  condition 100, net +0.4 %/h forever — the light-insufficient stressor is
  gated behind `resources.light > 0`. On the roadmap as its own item.
- **`feed` quantises the food pool to 0.01 g** via `+(food + amount)
  .toFixed(2)`, so ten feeds of 0.004 g leave 0. Defect register.
- **`excessLightPeak: 0.4` is unreachable.** It needs 170 substrate PAR; the
  brightest buildable tank reaches 126.4. A ceiling, not a floor — deliberate.
- **`planted` runs pH 5.94–6.50**, below all five species' floor for part of
  every day. Pre-existing. Measured during the empirical pass, not reproducible
  from the committed harness — `runTank` samples plants and algae only, so a
  future pass wanting water chemistry has to widen it.

---

## 6. Reproduction

```bash
npm run probe:default-fixture-survival   # §1, branch column
npm run probe:par-dose-response          # §3, both tables
```

§2 is `calculateParAtDepth(1, calculateTankHeight(litres), opticsDefaults)`,
which is retention by definition.

The harness is committed at `src/simulation/tests/metrics.ts` and drives
`keep()` from `tanks.ts`, so a figure here and a figure in an anchor come off
one schedule.

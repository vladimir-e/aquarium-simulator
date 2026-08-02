# Empirical validation: `substrate-organic-leaching`

Date: 2026-08-02 · Branch: `substrate-organic-leaching` (781419d) · Engine unchanged

Every number below is a measured engine run, not a code reading. Harness drove
`tick()` directly with `Math.random` replaced by a seeded mulberry32 so runs are
comparable. Fishless baselines: heater holding 25 °C, no light (no algae), no
plants, full lid + ATO (volume constant), sponge filter unless noted.

Confounder control for the known out-of-scope anomalies: all-male rosters
(breeding runaway), sponge filters everywhere (caps at 300 LPH = neon tetra
`maxFlow`, so flow stress never activates), zero plants, and weekly 25 % water
changes on long stocked runs (nitrate-at-40 cliff). Where a scenario could not
avoid one, it is called out.

Branch health: `npm test` 2250 passed / 132 files. `npm run lint` 0 errors,
3 pre-existing `no-console` warnings.

---

## 1. Anchor scorecard

| # | Anchor | Measured | Verdict |
|---|---|---|---|
| 1 | Aqua soil: NH₃ crosses 0.5 ppm day 2–4 | **day 2.63**, identical 10 L→1000 L | **PASS** |
| 2 | Aqua soil: nitrite peaks 2–5 ppm | **4.89–4.93 ppm** (98 % of ceiling) | **PASS, no margin** |
| 3 | Aqua soil: nitrite peak day 12–16 | **day 15.1–15.3** | **PASS** |
| 4 | Aqua soil: cycled (NO₂<0.1, NO₃ rising) day 21–28 | **day 21.0–22.4** | **PASS, at floor** |
| 5 | Gravel/sand: crosses threshold ~day 14–21 | gravel **14.29**, sand **19.38** | **PASS** |
| 6 | Gravel/sand: peak under 1 ppm | NO₂ **1.64 / 1.49**; NH₃ 0.53 / 0.51 | **FAIL** (nitrite reading) |
| 7 | Bare bottom never cycles unaided | NH₃ 0.000 for 70 d, AOB never spawns | **PASS** |
| 8 | Volume independence | spawn day identical; cycled day spread **1.4 d over 100× volume** | **PASS** |
| 9 | Soil reserve spent by ~week 8 | **98.2 % spent at day 56** | **PASS** |
| 10 | Cycled tank clears 2 ppm to <0.25 in 24 h | 0.27–1.09 ppm fishless; passes only stocked ≥75 L | **FAIL** |
| 11 | Cycled tank, normal cadence, never spikes NH₃ past 0.1 | **NH₃ max 0.0000**, 0 alerts in 90 d | **PASS** |
| 12 | Colony starved a week keeps most capacity | **93.3 % retained**, no spike on return | **PASS** |
| 13 | Cut off entirely, half-life 2–4 weeks | **21.0 days measured** | **PASS** |
| 14 | Settled colony at a few % of capacity, 20–30× headroom | **16.9–38.6×**, volume-dependent | **PARTIAL** |
| 15 | Surface cap binds only when genuinely overstocked | **61 % of K at 12 tetras in 40 L** | **FAIL** |
| 16 | Rescape: fresh ammonia ramp + colony clipped | clipped **yes**; ramp **absent** (NH₃ max 0.0000) | **PARTIAL** |

---

## 2. The volume sweep — the branch's central claim

Fishless, aqua soil, 70 days.

| litres | AOB spawn day | NH₃ peak | NO₂ peak | NO₂ peak day | NOB day | cycled day | NO₃ end | K | AOB %K |
|---|---|---|---|---|---|---|---|---|---|
| 20 | 2.63 | 1.073 | 4.910 | 15.25 | 7.58 | 21.88 | 10.86 | 357 | 16.4 |
| 38 | 2.63 | 1.070 | 4.897 | 15.17 | 7.54 | 21.50 | 10.86 | 593 | 11.7 |
| 75 | 2.63 | 1.068 | 4.894 | 15.13 | 7.54 | 21.25 | 10.86 | 1070 | 7.4 |
| 150 | 2.63 | 1.067 | 4.892 | 15.13 | 7.54 | 21.13 | 10.86 | 2022 | 4.2 |
| 300 | 2.63 | 1.067 | 4.891 | 15.08 | 7.54 | 21.08 | 10.86 | 3906 | 2.3 |

Extended grid, aqua soil:

| litres | 10 | 20 | 30 | 40 | 60 | 80 | 100 | 150 | 200 | 300 | 500 | 1000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| spawn day | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 |
| NO₂ peak | 4.926 | 4.910 | 4.907 | 4.896 | 4.894 | 4.893 | 4.893 | 4.892 | 4.891 | 4.891 | 4.890 | 4.898 |
| cycled day | 22.42 | 21.88 | 21.63 | 21.46 | 21.33 | 21.25 | 21.21 | 21.13 | 21.13 | 21.08 | 21.04 | 21.04 |

Gravel and sand are flatter still — spawn day and peak day identical to three
significant figures across 20–300 L; cycled day spreads 0.29 d (gravel) and
0.38 d (sand).

**Verdict: the branch does what it exists to do.** Over a 100× volume range the
spawn day is bit-identical, the nitrite peak varies 0.7 %, and cycled day
varies 1.4 days (6 %). Compare the bug it replaced: 20 L cycled in 7 days,
150 L in 51.

The residual drift is monotone — smaller tanks cycle *later* — and traceable to
the logistic ceiling, not to the leaching model. Surface has a volume-independent
term (filter media, 8000 cm² for a sponge) and a `V^(2/3)` glass term, so K per
litre is higher in small tanks *but the colony the same per-litre load requires
is volume-independent*, leaving a 20 L colony at 16.4 % of K versus 2.3 % at
300 L. The extra `(1 − p/K)` suppression in the small tank slows its ramp. This
is a second-order artefact of the surface model, not of leaching.

---

## 3. Substrate matrix (75 L, fishless, 70 days)

| substrate | AOB spawn day | NH₃ peak | NO₂ peak | NO₂ peak day | NOB day | cycled day | NO₃ end | reserve left d70 |
|---|---|---|---|---|---|---|---|---|
| aqua_soil | 2.63 | 1.068 | 4.894 | 15.13 | 7.54 | 21.25 | 10.86 | 0.6 % |
| gravel | 14.29 | 0.527 | 1.643 | 22.29 | 19.21 | 29.83 | 2.82 | 0.6 % |
| sand | 19.38 | 0.506 | 1.494 | 26.75 | 24.33 | 34.67 | 2.39 | 0.6 % |
| none | never | 0.000 | 0.000 | — | never | never | 0.00 | — |

Reserve drawdown (identical fraction for every substrate — one rate, one curve):
day 28 → 13.3 % left · day 42 → 4.8 % · **day 56 → 1.8 %** · day 70 → 0.6 %.

Mass balance closes exactly: 0.05 g/L × 60 mg NH₃/g = 3.00 ppm NH₃ →
×(46.01/17.03) → 8.11 ppm NO₂ → ×(62.00/46.01) → **10.92 ppm NO₃** predicted
against **10.86 measured**. No nitrogen leaks.

---

## 4. Do the timing and magnitude anchors conflict?

**Yes — they are in genuine tension, and the shipped `spawnAmount` sits at the
top edge of a window narrower than the code comment claims.**

The mechanism is a fixed budget. The bed holds 8.11 ppm of NO₂-equivalent
nitrogen and releases it on a fixed 9.6-day half-life. Nitrite standing at any
moment is `produced − consumed`; delaying the AOB ramp by a day is another day
of production accumulating unconsumed. Peak height and peak day are the same
knob read twice.

`spawnAmount` sweep, aqua soil:

| spawnAmount | 20 L NO₂ peak | 20 L cycled | 300 L NO₂ peak | 300 L cycled | both anchors hold |
|---|---|---|---|---|---|
| 0.58 | 5.031 | 22.46 | 5.003 | 21.67 | no — peak > 5 |
| 0.60 | 5.006 | 22.33 | 4.978 | 21.54 | no — peak > 5 |
| **0.62** | 4.982 | 22.21 | 4.954 | 21.42 | **YES** |
| 0.65 | 4.941 | 22.00 | 4.922 | 21.25 | YES |
| **0.68** (shipped) | 4.910 | 21.88 | 4.891 | 21.08 | **YES** |
| 0.70 | 4.887 | 21.75 | 4.867 | **20.96** | no — cycled < 21 |
| 0.72 | 4.864 | 21.63 | 4.846 | 20.83 | no — cycled < 21 |

**Measured feasible window: 0.62 – 0.68.** The config comment claims "0.63–0.72
and no wider" — the upper bound is wrong. At 0.70 a 300 L tank cycles on day
20.96, below the anchor floor. The shipped 0.68 is the *last* passing value: one
step up fails timing, and the whole window only ever buys 0.07 ppm of nitrite
headroom (4.98 → 4.91). Peak magnitude is not meaningfully controllable by this
knob.

**`spawnAmount` is the wrong lever for the peak.** The dominant lever is the
leach rate:

| leachRate | reserve half-life | NO₂ peak | NO₂ peak day | cycled day | reserve left d50 |
|---|---|---|---|---|---|
| 0.001 | 28.9 d | 2.687 | 19.04 | 24.79 | 30.1 % |
| 0.002 | 14.4 d | 3.952 | 16.17 | 22.00 | 9.1 % |
| **0.003** (shipped) | 9.6 d | 4.892 | 15.13 | 21.13 | 2.7 % |
| 0.005 | 5.8 d | 6.182 | 13.92 | 20.54 | 0.2 % |
| 0.008 | 3.6 d | 7.093 | 12.83 | 20.13 | 0.0 % |

Halving the leach rate to 0.002 buys 0.94 ppm of headroom (4.89 → 3.95) — an
order of magnitude more than the entire `spawnAmount` window — at the cost of
pushing peak day to 16.17 (0.17 d outside the 12–16 anchor) and leaving 6.8 % of
the reserve at week 8. `nobGrowthRate` is the other real lever: a 30 h NOB
doubling gives peak 4.73 but pulls cycled to day 19.0.

So the three anchors — peak ≤ 5 ppm, peak on day 12–16, cycled on day 21–28 —
are **simultaneously satisfiable only in a narrow corner of the parameter space,
and the branch is sitting in it with ~2 % margin on the peak and ~0.4 % on the
cycled-day floor.** They do not contradict each other outright, but there is no
slack: any future change to leach rate, NOB growth, processing rate, or the
surface model will push one of them out.

### Does anything breach 5 ppm?

**Yes, once — marginally.** Sweeping volume (5–300 L) × filter (none / sponge /
hob / canister / sump) on aqua soil:

| config | NO₂ peak |
|---|---|
| **5 L, no filter** | **5.0009** |
| 5 L, sponge | 4.944 |
| 10 L, no filter | 4.946 |
| 20 L, sponge | 4.910 |
| everything ≥ 20 L | 4.891 – 4.914 |

A 5 L unfiltered aqua-soil tank peaks at 5.0009 ppm — a 0.02 % overshoot, and
reachable in the UI (the `bare` preset ships with no filter). Every other
configuration stays under. The mechanism is the one described above: less
surface → more logistic suppression → slower AOB ramp → higher peak.

---

## 5. Ranked findings

### F1 — Cycled tanks cannot clear a 2 ppm ammonia dose (anchor 10). *Pre-existing root cause, exposed by this branch.*

Dose 2 ppm NH₃, measure 24 h later. Anchor wants < 0.25 ppm.

| tank | state at dose | AOB | @1 h | @12 h | @24 h | @48 h | verdict |
|---|---|---|---|---|---|---|---|
| 20 L | fishless, d30 | 160.3 | 1.969 | 1.593 | **1.090** | 0.000 | FAIL |
| 20 L | stocked+fed, d125 | 207.2 | 1.963 | 1.497 | **0.947** | 0.000 | FAIL |
| 40 L | fishless, d30 | 195.3 | 1.962 | 1.487 | **0.823** | 0.000 | FAIL |
| 40 L | stocked+fed, d125 | 296.1 | 1.946 | 1.261 | **0.408** | 0.000 | FAIL |
| 75 L | fishless, d30 | 221.1 | 1.957 | 1.404 | **0.595** | 0.000 | FAIL |
| 75 L | stocked+fed, d125 | 369.1 | 1.931 | 1.045 | **0.000** | 0.000 | PASS |
| 150 L | fishless, d30 | 240.6 | 1.953 | 1.337 | **0.401** | 0.000 | FAIL |
| 150 L | stocked+fed, d125 | 430.2 | 1.919 | 0.849 | **0.000** | 0.000 | PASS |
| 300 L | fishless, d30 | 252.3 | 1.951 | 1.296 | **0.273** | 0.000 | FAIL |
| 300 L | stocked+fed, d125 | 477.3 | 1.909 | 0.694 | **0.000** | 0.000 | PASS |

The anchor holds only for a stocked tank of ≥75 L whose colony is being held up
by a standing bioload. It fails for **every fishless tank** — which is the state
the hobbyist test actually refers to (you finish a fishless cycle, then dose to
confirm). It also fails for small tanks in every state.

Worse, the classic fishless-cycle protocol diverges badly. Dosing 2 ppm daily
from day 0:

| tank | first day clearing 2 ppm in 24 h | NO₂ peak reached | NO₃ at d60 |
|---|---|---|---|
| 20 L | **never** | 57.6 ppm | 234 ppm |
| 40 L | d31 | 96.8 ppm | 394 ppm |
| 75 L | d16 | 108.5 ppm | 448 ppm |
| 150 L | d12 | 67.3 ppm | 393 ppm |
| 300 L | d11 | 33.7 ppm | 335 ppm |

Real fishless cycles under this protocol peak nitrite around 5–15 ppm and clear
2 ppm within 24 h by week 3–4 at any tank size. Here nitrite reaches 108 ppm and
a 20 L tank **never** reaches the clearance criterion at all.

**Root cause — a dimensional error in processing capacity, present on `main`
unchanged:**

```ts
const canProcessMass = aobPopulation * config.bacteriaProcessingRate * waterVolume;
```

Per-bacterium mass throughput scales with how much water surrounds it. Consequences:

- ppm cleared per hour = `aob × rate` — so clearance depends on *absolute colony
  size*, not colony-per-litre.
- The ceiling `K = surface × bacteriaPerCm2` scales roughly with volume (the
  substrate term is 1200 cm²/L). So **maximum ppm throughput scales linearly with
  tank volume** — a 300 L tank can clear ppm 11× faster than a 20 L one.
- The colony a given per-litre load *requires* is volume-independent (~350–500
  AOB at every size, measured in §7). So small tanks run near their ceiling and
  large tanks never approach it.

This is why the cycling timeline is volume-independent (utilization is a
dimensionless ratio, so the litres cancel in the ramp) while every
*concentration-clearance* observable is not. `git show main:` confirms the line
is byte-identical on `main` — **the branch did not introduce it**. But by
dropping `spawnAmount` 10 → 0.68 and slowing `bacteriaDeathRate` 15×, the branch
changed where the colony settles, and that is what makes the defect measurable.

### F2 — Fish-in cycle wipes the tank out, and daily 25 % water changes do not save it (scenario 5). *This branch's parameters, pre-existing mechanism.*

40 L aqua soil, 6 neon tetras stocked day 0, 0.1 g food/day, no water changes:

| day | NH₃ | free NH₃ | NO₂ | alive | mean HP |
|---|---|---|---|---|---|
| 4 | 1.154 | 0.0064 | 0.056 | 6 | 100.0 |
| 6 | 1.601 | 0.0088 | 0.305 | 6 | 80.0 |
| 8 | 1.893 | 0.0105 | 1.418 | 5 | 17.7 |
| 10 | 2.787 | 0.0155 | 5.512 | **0** | 0.0 |
| 16 | 0.000 | 0.0000 | **14.447** | 0 | — |

All six dead by day 10. The killer is **nitrite, not ammonia** — free NH₃ never
exceeds 0.016 ppm (pH 6.5–7.0 keeps the unionized fraction at ~0.55 %), while
nitrite reaches 14.4 ppm against a `nitriteStressSeverity` of 2.5 %/ppm/h.

Water-change rescue sweep (same tank, 45 days):

| regime | NH₃ max | NO₂ max | alive | first death |
|---|---|---|---|---|
| none | 3.599 | 14.450 | 0/6 | d8.0 |
| **25 % daily** | 1.412 | 6.781 | **0/6** | d9.8 |
| 50 % daily | 0.691 | 4.448 | **0/6** | d13.7 |
| 75 % daily | 0.387 | 0.000 | 6/6 | none |
| 90 % daily | 0.331 | 0.000 | 6/6 | none |
| 50 % twice daily | 0.292 | 0.000 | 6/6 | none |

**The brief's scenario — daily 25 % changes, fish survive — fails.** Survival
requires ≥75 % daily, or 50 % twice a day. A beginner following standard advice
(25 % daily during a fish-in cycle) loses the whole tank in this engine.

The *chemical* shape of the anchor is right, though. Withdrawing the daily 25 %
change at day D and watching the following 30 days:

| substrate | stop at d7 | d14 | d21 | d28 | d35 |
|---|---|---|---|---|---|
| aqua_soil NO₂ max after | 11.72 | 3.65 | 0.00 | 0.00 | 0.00 |
| gravel NO₂ max after | 10.42 | 8.08 | 1.15 | 0.00 | 0.00 |

"Needs water changes for the first 3–4 weeks, then doesn't" is exactly
reproduced — aqua soil is safe to stop at day 21, gravel at day 28. The engine
gets the *timeline* right and the *survivability* wrong.

Contributing factor, worth separating: nitrite tolerance. The config docstring
targets a 96-h LC50 near 4–5 ppm, which is defensible, but combined with a
nitrite peak that reaches 14 ppm in a stocked uncycled tank the outcome is a
guaranteed wipeout rather than the "stressed but survivable with diligence"
scenario the anchor describes.

### F3 — The surface cap binds at ordinary stocking (anchor 15). *This branch's doing — acknowledged in the config comment.*

Stocked at day 35 into a cycled tank, run 120 days, weekly 25 % water change:

| tank | tetras | AOB end | K | **% of K** | NH₃ load mg/h | capacity mg/h | headroom × | utilization |
|---|---|---|---|---|---|---|---|---|
| 40 L | 3 | 176.6 | 619 | 28.5 | 0.045 | 1.411 | 31.4 | 0.032 |
| 40 L | 6 | 274.4 | 619 | **44.3** | 0.090 | 2.193 | 24.4 | 0.041 |
| 40 L | 12 | 380.3 | 619 | **61.4** | 0.180 | 3.040 | 16.9 | 0.059 |
| 75 L | 12 | 352.3 | 1070 | 32.9 | 0.180 | 5.280 | 29.3 | 0.034 |
| 75 L | 24 | 530.2 | 1070 | **49.6** | 0.360 | 7.946 | 22.1 | 0.045 |
| 150 L | 24 | 416.4 | 2022 | 20.6 | 0.360 | 12.481 | 34.7 | 0.029 |
| 150 L | 48 | 693.5 | 2022 | 34.3 | 0.720 | 20.785 | 28.9 | 0.035 |
| 300 L | 48 | 463.8 | 3906 | 11.9 | 0.720 | 27.805 | 38.6 | 0.026 |

Twelve neon tetras in a 40 L (10 gal) tank is an ordinary community stocking, and
the colony sits at **61.4 % of `maxBacteria`** — the logistic term is throttling
growth by 61 % at a load that should not come near the ceiling. Six tetras in the
same tank already reach 44 %. The anchor says the cap should bind only when
genuinely overstocked.

`bacteriaPerCm2 = 0.01` is mis-scaled, as the anchor's diagnostic predicts. The
branch's own config comment concedes this: *"at the `bacteriaPerCm2` this engine
ships, an ordinary load parks a colony at 50–90 % of K and the logistic term
stops it first."* That is a known deviation shipped as-is, not an oversight — but
it is a real anchor failure and it is the same root cause as F1: required colony
size is volume-independent, K is not, so the smallest tanks bind first.

Headroom (14) lands at 16.9–38.6× against an anchor of 20–30×, and drifts
systematically with volume for the same reason. Utilization 2.6–5.9 % — "a few
percent of processing capacity" holds.

### F4 — Rescape is exploitable: alternating substrates mints unlimited nitrogen. *This branch's doing.*

`replaceSubstrate` guards only against re-selecting the *same* type. Alternating
between two types re-mints a full reserve on every swap. 75 L, alternating
aqua_soil ↔ sand every 10 days for 120 days:

| | alternating | never rescaped |
|---|---|---|
| NO₃ at day 120 | **41.5 ppm** | 11.0 ppm |
| AOB at day 120 | **267.6** | 16.1 |

**3.76× the single-bed nitrogen budget** in 120 days, and it keeps a colony alive
indefinitely in a tank with no other input. The guard's docstring says
"returning the same substrate is what stops a reserve from being re-minted by
toggling the setting" — it stops the one-type toggle and misses the two-type
cycle. There is no cost to a rescape (no cash, no cooldown, no colony penalty
beyond the ceiling clip), so nothing bounds it.

### F5 — Rescape produces no ammonia ramp (anchor 16, half). *This branch's doing.*

Rescape from a loaded 75 L (24 tetras, AOB 529.8) at day 125:

| swap | K before → after | AOB before → after | clipped | reserve before → after | post NH₃ max | post NO₂ max |
|---|---|---|---|---|---|---|
| aqua_soil → sand | 1070 → 470 | 529.8 → **469.0** | **YES** | 0.0005 → 0.8225 | 0.0000 | 0.0000 |
| aqua_soil → gravel | 1070 → 770 | 529.8 → 529.5 | no (below new K) | 0.0005 → 0.9721 | 0.0000 | 0.0000 |
| aqua_soil → none | 1070 → 170 | 529.8 → **169.4** | **YES** | 0.0005 → 0.0000 | 0.0000 | 0.0000 |
| sand → aqua_soil | 470 → 1070 | 34.2 → 34.6 | n/a | 0.0109 → 3.7388 | 0.001 | 0.139 |

Clipping works correctly and exactly (`aob → maxBacteria`). The ammonia ramp does
not appear: a fresh aqua-soil bed leaches 3.75 g × 0.003 = 0.011 g/h → 0.20 mg
NH₃/h, against a surviving colony capacity of 7.0 mg/h — 35× headroom, so no
spike is arithmetically possible. Even a `sand → aqua_soil` swap on a lightly
colonised tank only reaches 0.139 ppm nitrite.

In a real tank, dropping fresh aqua soil into an established system reliably
produces an ammonia spike. The leach rate is simply too slow relative to colony
capacity for a rescape to register as an event.

### F6 — Gravel and sand nitrite peaks are 1.5–1.6× the anchor ceiling (anchor 6). *Pre-existing threshold interacting with the new budget.*

| substrate | litres | NH₃ peak | NO₂ peak | NO₂ peak day | cycled day |
|---|---|---|---|---|---|
| gravel | 20 / 75 / 150 / 300 | 0.527 | **1.645 / 1.643 / 1.643 / 1.643** | 22.29 | 29.75–30.04 |
| sand | 20 / 75 / 150 / 300 | 0.506 | **1.495 / 1.494 / 1.493 / 1.493** | 26.71–26.79 | 34.54–34.92 |

The anchor reads most naturally as a nitrite peak (paralleling the aqua-soil
line, which specifies nitrite), and on that reading both fail by 50–65 %. On an
ammonia reading both pass comfortably (0.53 / 0.51). Flagging the ambiguity —
but the nitrite reading is the one that fails.

**Root cause: the AOB spawn threshold is an absolute concentration while the
budget is per-substrate.**

| substrate | total NH₃ budget | spawn threshold as % of budget | NO₂-equiv budget | observed peak | **peak as % of budget** |
|---|---|---|---|---|---|
| aqua_soil | 3.00 ppm | 17 % | 8.11 ppm | 4.894 | 60.4 % |
| gravel | 0.78 ppm | **64 %** | 2.11 ppm | 1.643 | **78.0 %** |
| sand | 0.66 ppm | **76 %** | 1.78 ppm | 1.494 | **83.8 %** |

For sand, 76 % of the bed's entire ammonia budget must accumulate before AOB can
even spawn. By then most of the reserve has leached; AOB ramps and converts the
backlog to nitrite in a rush, well before NOB can follow. The lower the budget,
the larger the fraction that has to pile up first — exactly inverting the
intended relationship.

Confirmed by probe: lowering `nobSpawnThreshold` from 0.5 to 0.01 moves the
gravel peak only 1.643 → 1.436, still above 1 ppm. NOB timing is **not** the
dominant term; the AOB spawn threshold and the budget size are.

### F7 — Nitrification is completely temperature-independent. *Pre-existing.*

| target °C | 18 | 22 | 25 | 28 | 30 |
|---|---|---|---|---|---|
| AOB spawn day | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 |
| NO₂ peak | 4.912 | 4.910 | 4.894 | 4.918 | 4.923 |
| cycled day | 21.25 | 21.25 | 21.25 | 21.25 | 21.25 |

A tank at 18 °C cycles on exactly the same day as one at 30 °C. Real
nitrification carries a strong temperature dependence (roughly Q10 ≈ 2–3); a
cold-start cycle takes about twice as long. `nitrogen-cycle.ts` has no
temperature term on this branch or on `main`, while `decay.ts` does carry a Q10
for food breakdown — so the engine is internally inconsistent about it. Not on
the anchor list; reporting as a gap.

### F8 — Config comment overstates the `spawnAmount` window. *This branch's doing.*

The comment claims "The window is 0.63–0.72 and no wider." Measured, the upper
bound is between 0.68 and 0.70: at 0.70 a 300 L tank cycles on day 20.96, below
the anchor floor. True window **0.62–0.68**. The lower bound is also slightly
off (0.62 passes, comment says 0.63). Documentation-only, but it misrepresents
how much margin the shipped value has — which is none upward.

---

## 6. Scenarios that came out clean

**Cycled tank under load (scenario 4) — unambiguous pass.** 60 days post-stock,
daily feeding:

| tank | fish | g/day | NH₃ max | NH₃ mean | hours NH₃ > 0.1 | NO₂ max | fish alive |
|---|---|---|---|---|---|---|---|
| 40 L | 6 | 0.03 | **0.0000** | 0.0000 | **0** | 0.0000 | 6/6 |
| 40 L | 6 | 0.10 | **0.0000** | 0.0000 | **0** | 0.0000 | 6/6 |
| 75 L | 12 | 0.20 | **0.0000** | 0.0000 | **0** | 0.0000 | 12/12 |
| 150 L | 24 | 0.40 | **0.0000** | 0.0000 | **0** | 0.0000 | 24/24 |

Alert-log audit over 90 days and ~90 feeds on a cycled 75 L / 12 tetra tank:
**0 warnings, 0 ammonia alerts, 0 nitrite alerts.** Positive control (an
uncycled fish-in tank on the same harness) fires as expected — 1 ammonia
warning at tick 10, 1 nitrite warning at tick 181 — so the alert machinery is
live and the silence is real. **The post-feed alert pathology is gone.**

**Starvation and recovery (scenario 6) — pass.** Colony cut off entirely (fish
removed, food/waste/reserve zeroed) from a settled 75 L colony of AOB 326.1:

| days after cut | 1 | 3 | 7 | 14 | **21** | 28 | 42 | 56 |
|---|---|---|---|---|---|---|---|---|
| AOB % retained | 96.8 | 90.6 | 79.4 | 63.0 | **50.0** | 39.7 | 25.0 | 15.7 |

Measured half-life **21.0 days**, exactly `ln2/(21×24)`. Anchor wants 2–4 weeks.

A week away from a cycled, stocked 75 L (12 tetras, AOB 339.2 = 31.7 % of K):

| point | AOB | % retained | NH₃ | NO₂ | fish | mean HP |
|---|---|---|---|---|---|---|
| departure | 339.2 | 100.0 | 0.0000 | 0.0000 | 12 | 100.0 |
| day 7 (return) | 316.6 | **93.3** | 0.0000 | 0.0000 | 12 | 100.0 |
| +14 d | 334.8 | 98.7 | 0.0000 | 0.0000 | 12 | 100.0 |

93.3 % retained, **zero ammonia or nitrite spike on return**, full recovery in
two weeks, no deaths. Retention is higher than the pure-decay case because fish
keep excreting basal ammonia while fasted, which keeps the colony fed — a
correct and rather nice emergent behaviour.

**Long horizon (scenario 7) — pass, both modes.**

*Fishless, 180 days:* once the reserve is spent (~day 60) the colony decays on
the clean 21-day half-life — AOB 249.9 (d20) → 106.1 (d60) → 16.1 (d120) → 2.2
(d180) — while NO₃ holds flat at 11.0 ppm. Nothing oscillates, nothing runs away.
A fishless tank loses its cycle entirely by ~day 150, which is correct.

*Stocked (cycled first, 12 tetras, weekly 25 % WC):* AOB converges to 352.4 and
holds within 0.1 % from day 140 to 180; NO₃ oscillates 7.8–9.9 on the water-change
sawtooth; NH₃ and NO₂ pinned at 0.000; zero deaths over 180 days. The colony finds
a stable equilibrium and stays there.

---

## 7. What I could not determine

- **Whether F1's dimensional error is worth fixing.** Removing `× waterVolume`
  changes what `bacteriaProcessingRate` means and would require re-deriving it
  together with `bacteriaPerCm2`, which would in turn move every timeline in §2.
  I measured the consequences, not the cure. The fix is not local.
- **Which reading of anchor 6 is intended** — nitrite peak (fails) or ammonia
  peak (passes). Reported both; the parallel with the aqua-soil anchor line
  favours nitrite.
- **Whether the fish-in wipeout (F2) is a nitrogen-cycle failure or a livestock
  tolerance calibration.** The nitrite trajectory and the fish tolerance curve
  are both individually defensible; they are only lethal in combination. Testing
  that properly means moving `nitriteStressSeverity`, which is outside this
  branch and outside my remit here.
- **Whether the 5 L unfiltered 5.0009 ppm breach matters.** It is 0.02 % over
  and depends on the glass-surface approximation for a 5 L tank. I did not probe
  below 5 L.
- **Anything requiring the UI.** No browser was available; every result here is
  engine-level. The `useSimulation` / `WasteCard` / persistence-schema changes in
  the diff are untested by this pass.
- **Plant and algae interaction with the new leach path.** Deliberately excluded
  (zero plants, lights off) to keep the nitrogen read clean, per the brief's
  instruction to design around the known plant anomalies.

---

## 8. Reproduction

Harness and scenario scripts lived in `calibration-tmp/` (gitignored) and were
deleted after the run. Seed 12345 throughout; `Math.random` replaced by
mulberry32 so fish sex, hardiness offset and health jitter are deterministic.
Rosters forced all-male post-`addFish`. Every table above is direct stdout from
those scripts.

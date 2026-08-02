# Calibration run: sustainable-presets (reconnaissance)

Date: 2026-08-01 · Branch: main (no source changes) · Engine: `83b2d8f`

## Scenario

Not one of `scenarios/*.md`. The target is the "sustainable preset" goal: a
preset that hands the player a tank which is already cycled, planted, stocked
and equipment-complete, and holds for **90 simulated days with food as the only
input** — no water changes, no trimming, no dosing by hand.

Bar tested against, per tank:

| # | Criterion |
| --- | --- |
| 1 | no fish deaths, no plant deaths |
| 2 | NH₃ < 0.1 ppm, NO₂ < 1.0 ppm (engine alert thresholds) |
| 3 | NO₃ stable or slowly drifting, never near the 80 ppm alert |
| 4 | water level held by ATO; temperature inside every stocked species' range |
| 5 | fish and plants at condition 100 **with surplus accruing** (`breakdown.drained == 0`) |
| 6 | algae present but not taking over |

## Method

Scratch harness (`calibration-tmp/`, gitignored, deleted after the run) importing
the engine directly: `createSimulation` → direct seeding of biology and water
chemistry → `tick()` in an hour loop with a feeding schedule → per-day snapshot
of every resource plus a recomputed `computeFishVitality` / `computePlantVitality`
breakdown. Deterministic LCG for `createFish`, so runs are comparable.

The stateful CLI (`src/cli/sim.ts`) cannot express the setups this task needs —
it has no way to seed bacteria, nitrate, plant size beyond `addPlant`, or fish
sex — so the harness drove the engine directly. Everything the harness *can*
express through a real action (`addFish`, `addPlant`, `feed`) was kept inside
those actions' own limits (plant count caps, `initialSize ≤ 200`, stocking mass
ceiling) so the resulting numbers stay reachable.

## Results

### Nano / low-tech — PASSES the bar, with two caveats

20 L (5.3 gal), 1 betta, 3 low-demand plants, no CO₂, no doser.

```
tankCapacity      20 L
initialTemperature 26, roomTemperature 22, tapWaterTemperature 20, tapWaterPH 7.0
heater            enabled, target 26 °C, 50 W
filter            sponge          (80 L/h — betta maxFlow is 150)
light             10 W, 08:00 + 10 h
substrate         gravel
hardscape         1 driftwood + 1 neutral_rock
lid               mesh
ato               enabled
co2Generator      disabled
autoDoser         disabled
powerhead / airPump  disabled

fish              1 × betta  (adult, satiation 90)
plants            2 × java_fern @ size 120, 1 × anubias @ size 120
seed resources    aob 72, nob 72  (≈25 % of the 288 ceiling)
                  nitrate 100 mg (5 ppm), everything else 0
feeding           0.25 g every 4 days
```

90-day outcome (180-day run in brackets):

| Metric | Value |
| --- | --- |
| deaths | 0 fish, 0 plants (0 at 180 d) |
| NH₃ | 0–0.195 ppm, peaks the day after each feed — **21 "high ammonia" alerts** |
| NO₂ | 0–0.367 ppm (alert 1.0) |
| NO₃ | 5.0 → 3.0 ppm, slope −0.012 ppm/d (2.1 ppm at 180 d) |
| O₂ | nightly min 6.79–7.16 mg/L |
| temperature | 25.9 °C (betta 24–30, java fern/anubias 18–30) |
| pH | 6.63–6.66 once converged, from a 6.50 start (betta 6.5–7.5) |
| water | 99.2–100 % of capacity, ATO holding |
| AOB / NOB | oscillates 13–34 % / 14–28 % of ceiling (38–97 / 41–80 absolute) |
| fish | health 100, **surplus 50/50 (capped)**, net +0.35 %/h, drained 0 |
| plants | condition 100, size 120 → 173 % each (212 % at 180 d), net +0.30 %/h |
| algae | 0–2.6 % coverage |

Caveats: plant nutrient sufficiency falls 1.00 → 0.67 (0.46 at 180 d) because
the plants strip NO₃ below the 4.5 ppm a low-demand species wants; and the tank
fires an ammonia alert after every feed.

### Community — PASSES 90 days only with a **single-sex** roster, and only with the doser off

150 L (40 gal), 8 neon tetra + 6 corydoras, 6 low-demand plants, CO₂, ATO.

```
tankCapacity      150 L
initialTemperature 25, roomTemperature 22, tapWaterTemperature 20, tapWaterPH 7.0
heater            enabled, target 25 °C, 200 W
filter            sponge          (300 L/h — see anomaly A2; the UI flags this
                                   as "undersized for this tank")
light             50 W, 08:00 + 10 h
substrate         aqua_soil
hardscape         6 × neutral_rock   (no driftwood — see anomaly A9)
lid               mesh
ato               enabled
co2Generator      enabled, 3.0 bps, 07:00 + 11 h
autoDoser         DISABLED        (see anomaly A5)
powerhead / airPump  disabled

fish              8 × neon_tetra, 6 × corydoras — all one sex (see anomaly A3)
plants            3 × java_fern @ size 67, 3 × anubias @ size 67
seed resources    aob 102, nob 102  (≈5 % of the 2046 ceiling)
                  nitrate 1500 mg (10 ppm), phosphate 150 mg (1 ppm)
feeding           0.25 g every 2 days
```

90-day outcome:

| Metric | Value |
| --- | --- |
| deaths | 0 fish, 0 plants |
| NH₃ | max 0.023 ppm |
| NO₂ | max 0.032 ppm |
| NO₃ | 10 → 3.0 ppm (peaks 11.2 at d30, then declines) |
| O₂ | nightly min 5.16 mg/L at d90 — **and falling** (see below) |
| temperature | 25.0 °C (neon 22–28 ∩ cory 22–26) |
| pH | 6.67–6.74 |
| water | 99.0–100 % |
| AOB / NOB | 1.6–2.4 % of ceiling (32–49 absolute) — card reads "not cycled" |
| fish | health 100, surplus 50/50, net +0.54 %/h, drained 0 |
| plants | condition 100, size 67 → 127 % each, sufficiency 1.00 → 0.68 |
| algae | 0 % |

**Fails at ~day 170.** The plants keep growing (Σ size 402 → 984 % by d180),
plant respiration is a flat mg/L/h per 100 % size, so the nightly O₂ floor slides
5.16 (d90) → 4.40 (d120) → 3.91 (d150) → 3.61 (d180) and the first neon dies at
t4086 (day 170). Nothing but trimming stops it, which the "food only" contract
forbids.

Variant with medium-demand plants (3 × amazon_sword + 3 × java_fern @ 67 %) also
survives 90 days but ends at plant condition 97.9 and sufficiency 0.50 — the
swords are phosphate-starved (see A5).

## Anomalies

Ranked by how hard they block the sustainable-preset goal.

### A1 — Feed buttons are 5–60× the roster's entire daily ration · **engine calibration** · CONFIRMED, worse than described

The engine's own arithmetic: a fish at steady state eats
`(24 × satiationDecayRate / 100) × mass × baseFoodRate` per day.

| roster | total mass | daily ration | smallest UI button (0.25 g) |
| --- | --- | --- | --- |
| 1 betta | 3.0 g | 0.0043 g | **58× a day's ration** |
| 12 neon tetra | 6.0 g | 0.0086 g | **29×** |
| 8 neon + 6 cory | 28.0 g | 0.0403 g | **6.2×** |
| 12 neon + 8 cory | 38.0 g | 0.0547 g | **4.6×** |

The roadmap's "~0.03 g for a dozen young community fish vs a 0.25 g button" is
right in shape; the true figure for 12 neons is 0.0086 g, so the overdose is 29×,
not 8×.

Empirical fate of one 0.25 g press in the 20 L nano with one betta, traced hour
by hour for 36 h: **the fish ate 0.0123 g (4.9 %)**; 0.2068 g (82.7 %) decayed to
waste. NO₃ rose 10.0 → 14.4 ppm over the following five days from that single
feed. In the nano the food *that rots* is the dominant nitrogen source — larger
than the fish.

The UI already prices this honestly (`options()` in `src/ui/actions/verbs.ts`
labels each button with `amount / dailyRation` days of food) — the 0.25 g button
would read "58 d" on the nano. The buttons simply do not go small enough, and
there is no repeating-feeder equipment, so a preset cannot express its own
feeding cadence.

### A2 — Filter flow is a turnover; species `maxFlow` is an absolute L/h. Above ~50 L every filter is lethal · **engine modelling gap** · NEW

`getFilterFlow` returns `capacity × targetTurnover` (4–10×). `FishSpeciesData.maxFlow`
is an absolute 150–500 L/h. Flow damage `%/h` after hardiness:

| tank | filter | flow L/h | neon | betta | guppy | angelfish | cory |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20 L | sponge | 80 | 0 | 0 | 0 | 0 | 0 |
| 38 L | canister | 304 | 0.02 | 0.62 | 0.01 | 0 | 0 |
| 75 L | canister | 600 | 1.50 | 1.80 | 0.60 | 1.20 | 0.30 |
| **150 L** | **canister** | **1200** | **4.50** | **4.20** | **1.80** | **4.80** | **2.10** |
| 150 L | hob | 900 | 3.00 | 3.00 | 1.20 | 3.00 | 1.20 |
| 150 L | sump | 1500 | 6.00 | 5.40 | 2.40 | 6.60 | 3.00 |
| 300 L | canister | 2400 | 10.50 | 9.00 | 4.20 | 12.00 | 5.70 |

A fish's whole benefit budget is ~1.0–1.2 %/h, so anything above ~1.2 is
unsurvivable. **The shipped `community` preset (150 L + canister) kills every
tetra in the roster in 22–23 hours.** I lost seven full 90-day runs to this
before diagnosing it.

Every powerhead setting (908 / 1514 / 2271 / 3218 L/h) is instantly lethal to
every species in every tank.

Consequence: the only survivable filter in a 150 L tank is a **sponge** — which
the engine itself rates for ≤75 L and the UI labels "Undersized for this tank —
filtration can't keep up" (`src/ui/build/readings.ts:304`). The preset has to
ship a filter its own UI warns about.

### A3 — Breeding is exponential with no carrying capacity; a thriving tank kills itself · **engine modelling gap** · NEW

The bar's "surplus accruing" and "no fish deaths over 90 days" are mutually
exclusive for any mixed-sex roster. Surplus at cap *is* the breeding trigger:
a female spends `0.8 × surplusCap = 40`, re-accrues it in ~3.3 days at
net +0.5 %/h, and lays 25 eggs (neon) that hatch at 100 %, with no predation,
no egg loss and no density check.

Same 150 L tank, same everything, only the sex roll differs:

| roster | births | deaths | fish at d90 | NH₃ max | NO₃ d90 |
| --- | --- | --- | --- | --- | --- |
| single-sex | 0 | 0 | 14 | 0.023 ppm | 3.0 ppm |
| mixed-sex | 1450 | 1467 | **0** | **29.2 ppm** | 156 ppm |

The mixed-sex tank collapses at t904 (day 38). `sellFry` weekly rescues nothing
(1175 births, still a full wipe) — it removes fry but the adults keep spawning
and the standing bioload between sweeps is enough.

There is **no engine surface to set a fish's sex** — `createFish` rolls 50/50 and
`addFish` exposes no override — so the passing community configuration above is
not currently constructible through the engine's own actions.

### A4 — A fully colonised biofilter starves itself within 4 days · **engine modelling gap** · NEW

`nitrogenCycleSystem` checks the AOB death condition against the ammonia ppm
*left over after the AOB have eaten*. A healthy colony clears its whole load
each tick, so residual ppm is 0 < `aobFoodThreshold` (0.001) and the colony
loses 2 %/h. Growth is also 2 %/h — exactly symmetric — so the colony cannot
hold any position above the one where it fails to clear the load.

Traced in the nano seeded at 100 % of ceiling, fed 0.25 g every 4 days:

```
h    nh3ppm    aob     aob%
6    0.00000   245.5   88.6
24   0.00000   170.7   61.6
48   0.00000   105.1   37.9
96   0.00000    39.8   14.4     ← 4 days: 100 % → 14 %
105  0.01044    35.8   12.9     ← next feed lands on a depleted colony
132  0.20500    56.1   20.2     ← NH₃ peaks at 2× the alert threshold
168  0.02417    94.8   34.2
```

Two consequences for presets: (a) seeding "AOB/NOB at working capacity" is
meaningless — the engine sheds it in days, so the honest seed is the sawtooth
equilibrium; (b) the colony is always under-provisioned for the next feed, so a
perfectly healthy nano fires a **high-ammonia alert after every single feeding**
(21 alerts in 90 days).

NOB is worse: `nobGrowthRate` 0.015 vs `bacteriaDeathRate` 0.02, so nitrite must
be present >57 % of ticks for NOB even to hold station.

### A5 — The doser cannot feed the plants without nitrate-poisoning the fish · **engine calibration** · NEW

`fertilizerFormula` is a fixed all-in-one: NO₃ 50 : PO₄ 5 : K 40 : Fe 1 mg/ml —
a **10:1 N:P mass ratio** — and plant uptake is split by the *same* ratio, so
uptake can never rebalance a dose. In a stocked tank the nitrogen is already
supplied by the fish, so any dose large enough to cover phosphate floods nitrate.

150 L community, CO₂ 3 bps, 90 days:

| dose | deaths | NO₃ d90 | slope | PO₄ d90 | plant sufficiency | plant condition |
| --- | --- | --- | --- | --- | --- | --- |
| off | 0 | 15.7 | +0.07/d | 0.002 | 0.50 | 97.9 |
| 0.5 ml | 0 | 25.4 | +0.18/d | 0.002 | 0.50 | 99.5 |
| 1.0 ml | 0 | 31.1 | +0.19/d | 0.002 | 0.50 | 99.8 |
| 2.0 ml | **14** | 61.0 | +0.53/d | 1.889 | 1.00 | 100.0 |
| 4.0 ml | **14** | 99.6 | +0.83/d | 8.524 | 1.00 | 100.0 |

The doser has to reach 2 ml/day to lift phosphate at all, and 2 ml/day kills the
whole roster. **There is no setting in the 0.5–10 ml range that satisfies both.**
The showcase preset's auto-doser has to be shipped switched off, or the roster
restricted to low-demand plants that need no phosphate — which makes the doser
pointless.

### A6 — Plant respiration is mg/L/h regardless of tank volume; a planted tank suffocates at night · **engine modelling gap** · NEW

`calculateRespiration` returns an O₂ delta in mg/L per 100 % plant size, with no
volume term, and `calculatePhotosynthesis` does the same for O₂ release. So plant
gas exchange is *per-litre* — the same six plants draw the same mg/L/h from a
20 L nano and a 300 L tank.

```
Σ plant size    night O2 draw
   100 %        0.105 mg/L/h
   400 %        0.420
   800 %        0.840
  1200 %        1.260
```

Steady-state night O₂ (alert floor 4.0, fish stress below 5.0):

| tank / gear | Σ200 % | Σ400 % | Σ800 % | Σ1200 % |
| --- | --- | --- | --- | --- |
| 150 L canister, no air | 7.0 | 6.0 | 3.9 | **1.8** |
| 150 L canister + air pump | 8.0 | 7.7 | 7.0 | 6.3 |
| 38 L canister, no air | 6.2 | 5.2 | **3.1** | **1.0** |
| 20 L sponge + aeration | 6.4 | 5.7 | **4.3** | **2.9** |

A 17-plant 150 L "showcase planted tank" (Σ ≈ 1200 %) drops to O₂ 1.68 mg/L
overnight and kills the entire roster inside 24 h. This interacts with A2: the
flow ceiling that keeps the fish alive (300 L/h) also caps `flowFactor` at 0.2,
which caps the achievable gas-exchange rate at 0.15/h, which caps sustainable
plant biomass at roughly Σ450 %.

It also sets the community preset's expiry date: plants grow, respiration grows
with them, and the tank dies at ~day 170 with no player error.

### A7 — Photosynthesis over-produces oxygen by 1.9× · **engine modelling gap** · CONFIRMED (roadmap suspected "may not close the loop")

`o2PerPhotosynthesis` 0.7 against `co2PerPhotosynthesis` 0.5 gives an O₂/CO₂ mass
ratio of **1.400**. `6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂` implies 32/44 = **0.727**.
The engine releases **1.92× more O₂ mass than the CO₂ mass it fixes**. Respiration
uses the same pair reversed, so the two are self-consistent with each other but
both are off the same factor from chemistry; the carbon and oxygen pools do not
balance against each other.

Related: CO₂ *is* modelled as a shared finite pool (photosynthesis draws it down;
injection and respiration refill it), so "CO₂ is not modelled as a distributed
resource" is **not reproduced** as stated. What is true is that CO₂ injection and
dissolved O₂ are fully independent channels — injecting CO₂ has literally zero
effect on O₂ (verified: 7 tetras in 38 L, CO₂ off vs 2 bps, O₂ min 7.85 in both).

### A8 — Cycle duration scales linearly with tank volume · **engine calibration** · CONFIRMED

`decayDefaults.ambientWaste` is a flat **0.001 g/h regardless of tank volume**,
producing 0.06 mg NH₃/h in any tank, while `aobSpawnThreshold` is a *concentration*
(0.5 ppm). So the time to start a fishless cycle is directly proportional to
litres:

| tank | AOB spawns | NOB spawns | NO₂ peak | "cycled" (25 % of ceiling) |
| --- | --- | --- | --- | --- |
| 20 L | d7.1 | d9.3 | 1.74 ppm @ d12 | never |
| 38 L | d13.3 | d15.5 | 1.38 ppm @ d18 | never |
| 75 L | d26.1 | d28.3 | 1.22 ppm @ d30 | never |
| 150 L | **d51.7** | d53.9 | 1.14 ppm @ d56 | never |
| 300 L | d104 (arithmetic) | — | — | — |

The roadmap's "10 gal ≈ 21 d is right, 40 gal takes 50+ d" is confirmed, and the
root cause is exactly this: the numerator is volume-independent and the threshold
is volume-dependent.

Second-order finding in the same table: the UI's `cycled` flag (colonisation ≥ 25 %
of a *surface-derived* ceiling) is unreachable for fishless cycles at any volume,
and for stocked tanks above 75 L. The passing 150 L community preset above runs at
1.6–2.4 % colonisation with NH₃ and NO₂ pinned at zero — a perfectly cycled tank
that the card calls uncycled. Colonisation is measured against substrate surface,
which has nothing to do with the bioload.

### A9 — Driftwood + CO₂ pushes pH below every stocked species' range · **engine calibration** · NEW

`calculateHardscapeTargetPH` with 4 driftwood gives a pull of `1 − 0.7⁴ = 0.76`,
target 6.24; CO₂ at ~17 mg/L adds −0.48 → **pH 5.76**, against a neon/cory/sword
floor of 6.0. The shipped `community` preset carries 4 driftwood; adding CO₂ to it
(which the plant roster needs) puts the tank permanently out of range. Measured
5.99–6.50 in the first community pass. Fixed here by using neutral rock only.

### A10 — A continuously fed fish is permanently "Overfed" · **engine calibration** · NEW

A fish with food in the water refills to satiation 100 in a single tick, then
decays 0.6, so its steady state is **99.4** — and `satiationOverfedFloor` is 99.
The band comment in `config/livestock.ts` predicts the equilibrium "drops cleanly
into well-fed once the food drains", but standing food re-tops it every hour.

Betta in the converged nano, identical water, only satiation differs:

| satiation | net %/h | damage | benefit |
| --- | --- | --- | --- |
| 99.4 (steady state with food) | **+0.580** | 0.320 | 0.900 |
| 87 (well-fed peak) | **+1.200** | 0.000 | 1.200 |
| 60 (peckish) | +0.900 | 0.000 | 0.900 |

A well-kept fish runs at **48 % of its available vitality budget**, and the UI
labels it "Overfed" the whole time. This is why the nano's net rate reads +0.35
between feeds and +1.006 on the days the food pool has emptied.

### A11 — Fish take nitrate damage 40 ppm before the alert fires · **engine calibration + UI misreport** · NEW

`nitrateStressThreshold` is 40 ppm; `HIGH_NITRATE_THRESHOLD` is 80 ppm.

| NO₃ | neon damage | cory damage | (benefit budget ~1.2 %/h) |
| --- | --- | --- | --- |
| 45 ppm | 1.25 %/h | 0.75 %/h | neon already in net decline |
| 50 ppm | 2.50 | 1.50 | both declining |
| 80 ppm | 10.00 | 6.00 | **alert finally fires** |

A neon tetra is in irreversible decline from 45 ppm and dead well before the
player is told anything. Every "sustainable" run I lost to nitrate died silently.

### A12 — The ammonia alert fires at a harmless concentration · **UI / alert calibration** · NEW

The alert is on total TAN (0.1 ppm); toxicity is on the unionized fraction.
At the nano's pH 6.65 / 26 °C the free fraction is 0.30 %, so 0.1 ppm TAN is
0.053 %/h of raw stress — about 4 % of the fish's benefit budget. The alert is
1000× more sensitive than the damage it warns about at low pH, and roughly
correctly calibrated only at pH 8.0 (1.004 %/h). Combined with A4, the healthy
nano preset generates 21 alarming-but-meaningless warnings over 90 days.

### A13 — Plants can never bank surplus · **engine calibration** · NEW

`plantGrowthPerTickCap` is 2.0 while the maximum possible plant vitality net is
0.5 %/h (sum of the five benefit peaks). Growth drains `min(surplus, 2.0)` every
lit tick, so the bank is emptied every hour it fills and `Plant.surplus` reads
0.00 permanently — confirmed across every run, in every configuration, at every
plant size. The bar's "surplus accruing" is unobservable for plants, and the
`docs/6-PLANTS.md` claim that leftovers accumulate toward propagation cannot
happen under default constants.

### A14 — Amazon Sword cannot survive its own low-tech tank · **engine calibration** · NEW

`amazon_sword.tolerableCO2` is `[6, 40]` and the engine's `atmosphericCo2` is
**4.0**. Any tank with aeration (sponge filter or air pump) sits at exactly 4.0,
so the sword takes `1.5 × 2 × (1 − 0.5) = 1.5 %/h` of CO₂ damage every daylight
hour against a 0.5 %/h benefit budget. Measured: 6 swords in a 38 L sponge-filtered
tank, all dead, with the species doc string in `state.ts` explicitly claiming
"sword grows happily on atmospheric (~4 mg/L) CO₂ in low-tech tanks". The bound
sits 2 mg/L above the atmosphere it is described as tolerating.

### A15 — Light intensity does not affect photosynthesis · **engine modelling gap** · NEW

`calculatePhotosynthesis` gates on `light > 0` and never reads the wattage. A 5 W
lamp and a 200 W lamp produce identical O₂, identical CO₂ draw and identical
nutrient uptake. Wattage only reaches the model through the plant vitality
tolerance band and the algae `W/L` excess-light benefit. A preset's light choice
therefore has no effect on the nitrate balance it is supposed to drive.

### Not reproduced

- **Nitrite-peak projection freezing water volume** (`src/ui/run/bacteria.ts`).
  `nextVolume()` already models evaporation and ATO. Verified against the engine
  run forward, fishless so mortality does not confound: 38 L ATO-off projected
  383 h / 1.547 ppm vs actual 382 h / 1.545; 38 L ATO-on 423 h / 1.376 vs 424 h /
  1.377; 150 L 879 h / 1.265 vs 879 h / 1.265; 20 L 282 h / 1.967 vs 283 h / 1.968.
  **0 % error on both axes.** (With fish present the projection runs ~60 % low on
  the peak, but only because dead fish dump `deathDecayFactor × mass` of waste,
  which an "if nothing else changes" projection cannot foresee and does not claim
  to.)
- **Bacteria card dropping gill ammonia** (`src/ui/run/bacteria.ts`). The readout
  computes `gills` from `processMetabolism` and feeds `r.ammonia + gills +
  ammoniaProduced` into the AOB stage, and surfaces it as its own
  `gillsToAmmonia` row. Measured on the converged nano: gill NH₃ 0.0900 mg/h =
  0.00450 ppm, card reports 0.00450 — **59.9 % of the card's AOB input**, present
  and correct.
  Both files were written in `83b2d8f` (the UI redesign), so these two suspects
  predate current `main`.
- **O₂ runs low for ~7 tetras in a 10 gal with CO₂ on.** Different than
  described: fish and CO₂ are not the cause. 7 neons in 38 L, no plants —
  O₂ min 7.85 with CO₂ off *and* with CO₂ at 2 bps (identical). Add 6 plants at
  80 % and O₂ min falls to 5.41; the driver is plant respiration (A6), not the
  livestock or the CO₂.
- **Food decays too slowly in water.** Measured, judgement deferred: 5.00 %/h at
  25 °C → half-life 13.5 h, 95 % gone in 2.4 days (4.06 %/h and 3.0 days at 22 °C;
  6.16 %/h and 2.0 days at 28 °C). Whether that is "too slow" is a design call —
  it is not obviously wrong for flake in water. What it *does* do is hold the
  standing food pool up for ~3 days after a feed, which is what parks fish in the
  permanent overfed band (A10).

## The seeding question

**Nothing in the engine can hand the player a cycled tank today.**

| Seed dimension | Surface today | Gap |
| --- | --- | --- |
| equipment | `SimulationConfig` → `createSimulation` | complete |
| water volume, temperature | `SimulationConfig` | complete |
| tap water / room | `SimulationConfig` | complete |
| fish species + count | `addFish` action | no age, sex, satiation, health or surplus control |
| plant species + size | `addPlant` action (`initialSize` 0–200) | no condition or surplus control |
| **AOB / NOB** | none | `createSimulation` hard-codes `aob: 0, nob: 0` (`state.ts:954`) |
| **nitrate / phosphate / potassium / iron** | none | hard-coded 0 |
| **pH, O₂, CO₂** | none | hard-coded 6.5 / 8.0 / 4.0 |
| **algae mass** | none | hard-coded 0 |
| **waste / food** | none | hard-coded 0 |

`PresetDefinition` is `{ id, name, config: SimulationConfig }` — equipment only —
and `useSimulation.loadPreset` (`src/ui/hooks/useSimulation.ts:345`) *merges* the
preset's tank/equipment/environment into the running state while deliberately
preserving fish, plants, resources and tick. A preset that carries biology needs
that call to replace the biology, not merge around it.

Minimal honest shape:

```ts
export interface PresetSeed {
  /** Concentrations, not masses — the preset author thinks in ppm. */
  resources?: {
    nitratePpm?: number; phosphatePpm?: number; potassiumPpm?: number; ironPpm?: number;
    ph?: number; oxygen?: number; co2?: number;
  };
  /** Absolute colony counts. Percent-of-ceiling is the wrong unit — see A4/A8. */
  bacteria?: { aob: number; nob: number };
  fish?: Array<{ species: FishSpecies; count: number; sex?: FishSex; age?: number; satiation?: number }>;
  plants?: Array<{ species: PlantSpecies; count: number; size: number; condition?: number }>;
  algaeMass?: number;
}
```

applied inside `createSimulation` after the existing resource block, with
`loadPreset` switched from merge to replace. `sex` is load-bearing: without it
the community preset cannot exist at all (A3).

The seed values must be the engine's *equilibrium*, not the nominal ceiling —
seeding AOB/NOB at 100 % of ceiling is discarded within four days (A4). The
numbers to ship are the ones in the two preset blocks above: 72/72 for the nano
(25 % of a 288 ceiling), 102/102 for the community (5 % of a 2046 ceiling).

## Confidence

High on every number here — all of it is `tick()` output or the engine's own
config arithmetic, reproduced across 60+ ninety-day runs. The two candidate
presets were run to 180 days as well.

Low confidence on one judgement call: whether the community preset's ~day-170
oxygen failure (A6) should be treated as a bug or as intended "your tank
outgrows itself" pressure. It is stated as a fact and left to the maintainer.

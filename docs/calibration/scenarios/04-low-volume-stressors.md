# Scenario 4: 5gal Low-Volume Stressors

Small-volume edge cases where problems amplify. Two sub-scenarios on the same hardware: **(A) the minimum-viable betta setup** — 5 gal, one betta, one low-demand plant, gravel, no filter, relying on bacteria that colonize substrate and plant surfaces to handle the light bioload, running at 26°C where betta is comfortable. When the heater fails and temperature drops below 24°C, betta stress kicks in — not immediate death, but immune compromise, reduced appetite, fin clamping. **(B) overcrowding disaster** — same tank but stocked with 10 neon tetras. Even with the same bacteria support, 10 small fish in 19L is too much: both the bioload/volume ratio and the social stress (schooling fish in a too-small box with no swimming room) push stress markers up within days. Calibrates: low-volume concentration amplification, temperature stress on bettas, overcrowding/territory stress, filterless bacterial equilibrium on substrate+plant+glass surface alone.

## Setup — shared

- **Tank:** 19L (5 gal), gravel substrate (~15,200 cm² at 800 cm²/L), mesh lid (betta jumpers), no CO2, no powerhead, no air pump
- **Equipment:** Heater at 26°C, 50W (variant A.1 disables or reduces); light 5W, 8 hr/day; **no filter** (filter.enabled = false)
- **Plants:** 1 × Anubias attached to a small piece of driftwood. Low demand, tolerates no-filter condition, adds some surface area and mild nutrient uptake.
- **Hardscape:** 1 small driftwood (650 cm² surface), 1 small rock (400 cm²)
- **Surface area total:** tank glass (~4,000 cm² at this size) + gravel (~15,200) + driftwood (~650) + rock (~400) = **~20,000 cm²** available for bacteria. Modest but adequate for a single betta at steady state. Insufficient for 10 tetras under feeding pressure.

### Variant A — Betta baseline
- **Stock:** 1 × Betta (`betta`, 3 g, hardiness 0.6, temp range 24–30°C)
- **Food:** 0.03 g/day (4–5 pellets, very light). Bettas are small-stomached.
- **Water:** 30% change weekly. Top-off as needed.

### Variant A.1 — Betta cold stress (the failure mode)
- Same as A, but at tick 168 (1 week in, once established) heater is disabled. Room temp 20°C.

### Variant B — 10 tetras overcrowded
- **Stock:** 10 × Neon Tetra (`neon_tetra`, 0.5 g each, 5 g total — same mass as Vlad's 10-gal quarantine scenario, but half the water volume)
- **Food:** 0.05 g/day
- **Water:** no water changes in baseline run (the point is to see how fast problems compound). Variant B.1 adds 50% water changes every 2 days.

## Expected timeline (real-world)

### Variant A — Betta baseline (steady state)

**Days 0–7 (ticks 0–168):** Bacteria establish slowly on gravel and plant surfaces. Because the betta is alone and under-fed, NH3 barely registers — rises to 0.1–0.3 ppm in the first few days, AOB spawns and processes, stabilizes at ≤0.05 ppm after ~week 1. Nitrite similarly transient — a peak of 0.2–0.5 ppm around day 5–7, then clears. Nitrate climbs slowly to 10–15 ppm by day 7. Weekly 30% water change resets NO3 to ~7–10 ppm.

**Weeks 2–8 (ticks 336–1344):** Stable. Betta healthy, NH3/NO2 at 0, NO3 oscillating 5–15 ppm with weekly WC. Anubias slowly grows (condition 80–90% on NO3 + trace PO4). Algae low but present (5–15 range) — little plant competition, elevated residence time.

### Variant A.1 — Betta cold stress

**Tick 168 (week 1):** Heater disabled. Room temp 20°C.

**Tick 169–192 (first 24 hr of failure):** In 19L, temperature drops fast. Roughly 0.8–1.2°C/hr initially, decelerating as it approaches room temp. Water temp hits 22°C around tick 172 (4 hr post-failure), 21°C around tick 180 (12 hr), settles near 20.3°C by tick 192 (24 hr).

**Tick 192 (day 8 total, 1 day cold):** Betta at 20.3°C — 3.7°C below comfort low (24°C). Hardiness 0.6 buys some tolerance; health drops ~5–10% in first day. Appetite drops; unfed pellets accumulate and decay.

**Tick 216 (day 9, 2 days cold):** Health at ~80%. Fin clamping visible (narrative only — health score captures it). Fish stops eating. Food decay adds NH3 but slowly at 20°C (Q10 halves the decay rate).

**Tick 336 (day 14, 7 days cold):** Health ~50–65%. Risk of ich (narrative — not modeled). Ammonia mild (0.1–0.3 ppm) because bacteria are also slowed by cold but bioload dropped too. If temperature restored now, recovery over 2–3 weeks.

**If cold persists to day 21 (tick 504):** Health < 30%. Betta may die (health < 0) or be permanently compromised. At 20°C for 2+ weeks a betta is usually gone.

### Variant B — 10 tetras overcrowded

**Day 1 (tick 24):** With 5 g of fish in 19L, NH3 rises faster than in Scenario 1 (which had the same fish mass in 38L). By tick 24, NH3 ~0.4–0.8 ppm. Fish already show mild stress — tetras are schooling fish and this tank has no swimming room.

**Day 2–3 (ticks 48–72):** NH3 climbs to 1–2.5 ppm (roughly 2× the pace of the 10-gal scenario because half the volume). AOB starting to spawn from the existing bacteria seed on gravel/plant/driftwood surface, but the surface can only sustain ~2000 bacteria max — modest. Fish health drops more aggressively than in Scenario 1 because of the overcrowding stress multiplier (narrative — sim captures via faster ammonia rise).

**Day 4–5 (ticks 96–120):** First deaths. NH3 may peak 2–4 ppm. In a 19L tank, the cascade from dead fish is severe because each 0.5 g corpse contributes disproportionately to waste → NH3 in a small volume.

**Day 5–7 (ticks 120–168):** Mass die-off — expect 7–10 of 10 dead by day 7. A little faster than the 10-gal version.

**Day 7+:** Same post-die-off trajectory as Scenario 1, compressed. NO2 peaks day 7–10, NO3 accumulates, algae blooms day 10–14.

### Variant B.1 — 10 tetras with aggressive water changes
**Every 2 days, 50% water change.** NH3 never exceeds 0.5–0.8 ppm between changes. Fish lose health slowly from chronic low-level ammonia and overcrowding stress (tetras need space). Expect gradual decline — some fish deaths by week 2–3, but not the fast die-off of Variant B.

## Numeric checkpoints

### Variant A — Betta baseline (weeks 1 and 4)

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 3 | 72 | NH3 (ppm) | 0.1–0.4 | mid-cycle peak |
| 5 | 120 | NO2 (ppm) | 0.1–0.5 | cycling through |
| 7 | 168 | NH3 (ppm) | < 0.1 | |
| 7 | 168 | NO2 (ppm) | < 0.2 | |
| 7 | 168 | NO3 (ppm) | 8–18 | pre-WC |
| 7 (after WC) | 168 | NO3 (ppm) | 5–13 | 30% change |
| 28 | 672 | NH3 (ppm) | < 0.05 | steady |
| 28 | 672 | NO3 (ppm) | 6–16 | weekly sawtooth |
| 28 | 672 | betta health | > 90 | |
| 28 | 672 | temp (°C) | 25.5–26.5 | heater holding |
| 28 | 672 | algae | 5–20 | |

### Variant A.1 — Betta cold stress

| Hours post-failure | Tick (from 168) | Metric | Expected | Tolerance |
|--------------------|----------------|--------|----------|-----------|
| 1 | 169 | temp (°C) | 25.0–25.2 | slow initial drop |
| 4 | 172 | temp (°C) | 22.5–23.5 | steep middle |
| 12 | 180 | temp (°C) | 20.8–21.5 | |
| 24 | 192 | temp (°C) | 20.1–20.6 | near equilibrium |
| 24 | 192 | betta health | 85–95 | early stress |
| 48 | 216 | betta health | 70–85 | |
| 96 | 264 | betta health | 55–75 | declining |
| 168 | 336 | betta health | 40–65 | one week cold |
| 336 | 504 | betta health | 10–40 | critical, possible death |
| 336 | 504 | betta alive? | 0–1 (50/50) | either dying or barely alive |

### Variant B — 10 tetras overcrowded (no water changes)

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 1 | 24 | NH3 (ppm) | 0.4–0.8 | ±30% |
| 2 | 48 | NH3 (ppm) | 1.0–2.0 | climbing fast (small volume) |
| 3 | 72 | NH3 (ppm) | 1.5–3.0 | |
| 3 | 72 | avg fish health | < 75 | |
| 4 | 96 | NH3 (ppm) | 2.0–4.0 | |
| 4 | 96 | fish alive | 7–10 | first deaths possible |
| 5 | 120 | fish alive | 3–8 | mass die-off starting |
| 7 | 168 | fish alive | 0–3 | mostly dead |
| 8 | 192 | fish alive | 0 | complete die-off no later than day 10 |
| 14 | 336 | NO2 (ppm) | 1–4 | post-die-off cycling |
| 21 | 504 | NO3 (ppm) | 30–100 | accumulated from corpses+food |
| 21 | 504 | algae | 15–50 | bloom |

### Variant B.1 — 10 tetras, 50% WC every 2 days

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 2 | 48 | NH3 pre-WC (ppm) | 0.6–1.2 | |
| 2 | 48 | NH3 post-WC (ppm) | 0.3–0.6 | half |
| 7 | 168 | avg fish health | 60–80 | chronic stress |
| 14 | 336 | fish alive | 6–10 | some survive, some don't |
| 21 | 504 | avg fish health | 40–70 | tetras suffering from small volume + overcrowding |

## Subsystems calibrated

- **Low-volume ammonia amplification** — same fish mass in half the water = ~2× the ppm. Variant B vs Scenario 1 is a direct comparison.
- **Filterless bacterial equilibrium** — AOB/NOB maxing out on glass + gravel + plant + hardscape surface, no filter media. Carrying capacity ~2000 bacteria total. Adequate for 1 betta at 3 g, insufficient for 5 g of tetras under feeding pressure.
- **Small-tank thermal drift** — 19L cools ~4× faster than 150L. Heater failure timeline is the key number: 25 → 20°C in ~24 hr.
- **Betta temperature tolerance (hardiness 0.6)** — below 24°C starts stress damage; at 20°C, health drops 5–15% per day depending on exact coefficient. Should take 1–2 weeks to kill, not hours or months.
- **Fish stress aggregation at multiple stressors** — overcrowding in Variant B (inferred from bioload:volume ratio and schooling-species context) should compound with ammonia stress. Even without an explicit "crowding" stressor, the effect falls out of concentration math.
- **Weekly maintenance rhythm on small tanks** — smaller WC % or more frequent works better; 30% weekly on 19L = 5.7L replaced. Easy and sufficient for a betta-only setup.
- **Plant + hardscape surface area contribution** — Anubias and driftwood add meaningful bacterial habitat in filterless setups. Should be visible in capacity calculations.
- **Low-bioload long-term stability** — Variant A should run stably for 8+ weeks (the calibration endpoint). Sim shouldn't drift into a cycle crash or chronic instability.

## Failure modes (diagnostic hints for the agent)

- **Variant A has NH3 > 0.2 ppm at day 14+:** bacterial carrying capacity on non-filter surface is miscalculated. A lightly-fed 3 g betta in 19L with 20,000 cm² of colonizable surface should cycle fine. If it doesn't, check bacteria-per-cm² constant or filterless surface accounting.
- **Variant A.1 betta dies in 48 hours:** cold stress coefficient too steep. Bettas tolerate short cold snaps; lethality requires *sustained* exposure. 48 hr at 20°C should take health to ~80, not 0.
- **Variant A.1 temp takes more than 48 hr to stabilize near room temp:** thermal drift rate too slow for a 19L tank. 19L has minimal thermal mass; should reach ambient within a day.
- **Variant A.1 betta health doesn't recover after heater restored:** recovery curve broken. Once conditions restore, health should climb 1–3% per day back toward 100.
- **Variant B kills all tetras in 2 days:** NH3 too aggressive, or toxicity coefficient too strict. Neons at hardiness 0.5 should tolerate ~2 ppm for 1–2 days before critical collapse, like Scenario 1 but accelerated because volume is half.
- **Variant B kills no tetras in 10 days:** opposite problem — NH3 too mild, toxicity too forgiving, or bacteria growing unrealistically fast on filterless surfaces.
- **Variant B.1 keeps all tetras alive at 100% health:** 50% WC every 2 days is a lot, but the tetras are still overcrowded and still in a 5-gal. Some chronic stress should show up (health < 80), otherwise the overcrowding signal is missing. Flag: this might indicate the sim lacks a stocking-density stressor; it's acceptable if ammonia-based stress alone doesn't capture it, but a note for future enhancement.
- **Variant A NO3 climbs above 25 ppm between water changes:** for a 3 g betta fed 0.03 g/day, this is too much — check fish waste rate or plant consumption. Likely waste rate slightly too hot.

## Variants

- **Betta + 6 ghost shrimp**: snails/shrimp colony handles algae and food leftovers, reduces waste slightly. Expect NO3 peaks 5–10% lower.
- **Remove the plant (Variant A, no Anubias):** small reduction in bacterial surface and loss of mild NO3 consumer. NO3 climbs a bit faster (10–20 ppm weekly instead of 8–18). Within tolerance of Variant A baseline but slightly warmer curve.
- **Variant B in 38L (10-gal) for comparison:** this is exactly Scenario 1. NH3 rises half as fast, die-off timeline stretches from 5–8 days to 6–8+ days.
- **Sponge filter added to Variant B:** transforms the scenario — bacterial carrying capacity jumps from ~2000 to ~10,000+ with filter media. Still overcrowded (no swim room), ammonia rise is slowed significantly. Expect NH3 < 0.5 ppm during cycling, most fish survive the first two weeks. Longer-term stress from crowding still compounds.
- **Heater target at 23°C instead of failure:** sub-stress band for betta (22–24°C per spec). Expect mild health decline over weeks, not the cliff of 20°C. Useful to test the spectrum between comfortable and lethal.
- **Heater failure in Scenario 3 (40 gal)** for contrast: 150L drops much slower, 25 → 22°C over ~12 hr, 25 → 21°C over ~24 hr. Angelfish (hardiness 0.4, temp range 24–30) stressed but not as fast. Confirms thermal mass scales inversely with tank size.

# Scenario 1: Uncycled Quarantine Disaster

10gal bare quarantine tank (gravel optional, often nothing — just glass, heater, and a filter that has no bacteria yet), 10 neon tetras dropped in on day 0, fed generously because "they look hungry", no water changes. This is the textbook beginner failure: ammonia climbs fast because there are no bacteria to process it, and because there's almost no biological buffer in a small bare tank the concentration rises sharply. Fish stop eating around day 3-4, hang listlessly near the surface or the corner by day 5, and by day 6-8 the tank is a complete loss. This scenario calibrates raw fish-waste output, food-decay → ammonia conversion, ammonia toxicity on a mid-hardiness schooling fish, and secondarily the opportunistic algae bloom that rides on elevated nitrogen from day ~10+ if the tank is left running after the die-off.

## Setup
- **Tank:** 38L (10 gal), bare-bottom (substrate type `none`), no lid or mesh lid
- **Equipment:** HOB filter, fresh media with effectively zero bacteria surface seeding; heater at 25°C, 50W; light 8W on 10 hr/day (typical beginner default); no CO2, no air pump
- **Plants:** none
- **Stock:** 10 × Neon Tetra (`neon_tetra`, 0.5 g adult mass each, hardiness 0.5, temp range 22–28°C). Total bioload ~5 g of fish
- **Food regimen:** 0.10 g/day at tick 0 (generous — ~2× maintenance for 5 g of fish). This mimics the beginner pattern of "two pinches, morning and evening"; treat as single daily dose for simplicity
- **Maintenance:** none — no water changes, no substrate vacuuming, no top-off. This is the point

## Expected timeline (real-world)

**Day 0 (ticks 0–24):** Fish go in, eat eagerly. Ammonia starts at 0 but rises immediately from direct fish excretion (gill-secreted NH3, not just decaying food). By 24 hr total NH3 is already in the 0.25–0.5 ppm range in a tiny 38L volume with 5 g of fish and 0.1 g of food. No visible fish stress yet.

**Day 1–2 (ticks 24–72):** Ammonia climbs steadily. Fish still feeding, still appear normal. Uneaten food begins decaying into waste, which itself becomes ammonia (stage 1 of the N cycle) — but there are no bacteria to process it. AOB spawning threshold (0.5 ppm) gets crossed somewhere in this window, so bacteria *begin* to seed, but their population is tiny (spawn amount = 10 units) vs carrying capacity (~7000 on ~70,000 cm² glass+filter surface); they won't make a dent for another week.

**Day 2–3 (ticks 48–72):** Ammonia passes 1 ppm. Neon tetras at this level show stress: loss of color, reduced appetite, clamped fins. Health starts eroding measurably. A novice keeper might notice "they look pale" but not connect it.

**Day 3–5 (ticks 72–120):** Ammonia 2–4 ppm. Fish stop eating (hunger stressor kicks in but is dwarfed by ammonia toxicity). Gasping at surface — partly ammonia gill damage, partly because BOD from decaying food + no gas exchange from fish movement is depressing O2. First fatalities around day 4–5. Dead fish add waste directly to the tank via the death decay factor, accelerating the spiral.

**Day 5–7 (ticks 120–168):** Complete die-off. Neons are mid-hardiness and schooling (stress compounds in smaller schools as fish die). Nitrite has barely started appearing because AOB population is still tiny — the ammonia is so high it's dominating everything. Ammonia may peak 4–8 ppm depending on how fast decay cascades.

**Day 8–14 (ticks 168–336):** Tank is now a "fishless cycle" proceeding on dead biomass. AOB population grows, ammonia finally starts falling, nitrite rises into the 1–3 ppm range. NO fish left to care, but the tank is effectively cycling itself on corpses.

**Day 14–21 (ticks 336–504):** Nitrite crashes, nitrate accumulates (30–80 ppm given the mass of organics). With light still running and no plants, algae bloom becomes visible by day 14–18 — initially green water (free-floating algae) then fuzz on glass.

## Numeric checkpoints

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 1 | 24 | NH3 (ppm) | 0.25–0.75 | ±30% |
| 1 | 24 | waste (g) | 0.05–0.1 | ±50% |
| 2 | 48 | NH3 (ppm) | 0.75–1.5 | ±30% |
| 2 | 48 | AOB | > 0 (spawned) | nonzero |
| 3 | 72 | NH3 (ppm) | 1.5–3.0 | ±30% |
| 3 | 72 | avg fish health | < 90% | declining |
| 4 | 96 | NH3 (ppm) | 2.5–5.0 | ±30% |
| 4 | 96 | avg fish health | < 70% | visible stress |
| 5 | 120 | NH3 (ppm) | 3–7 | ±30% |
| 5 | 120 | fish alive | 5–9 of 10 | first deaths |
| 6 | 144 | fish alive | 0–5 of 10 | mass die-off |
| 7 | 168 | fish alive | 0 | ±0 (full kill expected by 168, acceptable up to 192) |
| 8 | 192 | fish alive | 0 | full die-off no later than day 8 |
| 10 | 240 | NO2 (ppm) | 0.5–3 | nitrite rising as AOB matures |
| 14 | 336 | NO3 (ppm) | 15–50 | accumulating |
| 18 | 432 | algae | > 10 | visible bloom |
| 21 | 504 | algae | 25–60 | established |
| 21 | 504 | NH3 (ppm) | < 0.25 | bacteria have caught up |
| 21 | 504 | NO2 (ppm) | < 0.5 | cycle completing on corpses |

## Subsystems calibrated

- **Fish metabolism / direct waste production** — rate of NH3 added per gram of fish per hour. This is the dominant source in days 0–2 before food decay kicks in.
- **Food decay → waste → ammonia chain** — verifies 40% of uneaten food becomes waste, then stage-1 mineralization converts waste to NH3 over ~3 hr half-life.
- **Bacteria absence → no processing** — AOB/NOB start at 0, spawn at thresholds, but do not meaningfully grow in the days-timeframe of this scenario.
- **Volume × concentration math** — 38L is the key stressor; the same fish in 150L would take 4× longer to reach lethal NH3. Use this scenario to verify ppm derivation from mg mass.
- **Ammonia toxicity on fish health** — neon tetra hardiness 0.5 should produce health decline from ~24 hr at 0.5+ ppm NH3 and near-certain death within 5–8 days at sustained 2+ ppm.
- **Death → waste → ammonia feedback loop** — dead fish contribute mass via `decay_factor`, accelerating the spiral.
- **Late-stage algae bloom** — excess NO3 + PO4 (from decay trace) + daily light, no plant competition.

## Failure modes (diagnostic hints for the agent)

- **NH3 never exceeds 0.5 ppm by day 3:** fish waste rate too low (check `fishMetabolism` waste coefficient), OR waste→ammonia mineralization rate too slow, OR bacteria spawn threshold was crossed too early and AOB grew faster than realistic.
- **NH3 peaks but all fish still alive at day 10:** ammonia toxicity on health insufficient. Neon tetra (hardiness 0.5) should take health damage at ≥0.1 ppm and die within 3–5 days at sustained ≥2 ppm. Check `ammoniaStressCoefficient` × `(1 - hardiness)`.
- **Fish die on day 1–2:** ammonia curve is too steep (waste rate too high), OR toxicity coefficient is regulatory-strict instead of diagnostic. Real neons tolerate a few days of mid-ppm NH3 before collapse.
- **Nitrite never appears:** AOB either never spawning (threshold too high, or ammonia math wrong) or growth rate too low. By day 10 nitrite should be detectable.
- **Algae doesn't bloom by day 18:** algae growth curve too slow, OR NO3/PO4 aren't being produced from the decay chain properly. Visible film in 2–3 weeks on a fish-killed tank is normal.
- **Ammonia drops to 0 by day 5 with no intervention:** bacteria are growing unrealistically fast. In a bare tank with minimal surface seeding, AOB takes 7–14 days to establish meaningfully, not 3–5.
- **Waste reaches double-digit grams:** decay rate too slow to consume the food (food shouldn't accumulate past ~1g at this feeding level).

## Variants

- **Daily 50% water change from day 0:** classic "quarantine done right". NH3 should stay capped around 0.25–0.5 ppm post-change. Fish survive. Agent should see ammonia sawtooth pattern with dilution every 24 hr.
- **Seeded filter (surface area pre-loaded with bacteria):** if the sim allows injecting AOB/NOB at spawn levels = carrying capacity, NH3 should never exceed 0.1 ppm. Confirms the scenario really is about missing bacteria, not some other coefficient.
- **Same stocking in 150L (40 gal) bare tank, no water changes:** NH3 rises 4× slower. Fish probably survive 2–3 weeks before die-off. The *shape* of the curve should be identical, scaled by volume.
- **Half the food (0.05 g/day):** delays timeline by ~2 days but die-off still occurs — fish metabolism alone is sufficient to kill in this volume.
- **Cold room (18°C room temp, no heater):** fish stress from cold + ammonia compounds. Death faster even though decay is slower; ammonia toxicity dominates.

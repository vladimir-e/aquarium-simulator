# Scenario 3: 40gal Community, Steady-State Nitrate Cycle

Vlad's canonical "well-run community tank" — 40 gallons, gravel, a handful of plants but plants are not the protagonist, canister filter doing the real work, 20 tetras and 4–5 bigger fish producing steady bioload. Ammonia and nitrite are always zero because the cycle is mature and the bacterial capacity is enormous relative to the bioload. The key observable is **nitrate accumulation**: from a fresh 0 ppm baseline after a water change, NO3 climbs roughly linearly to ~40 ppm over 6 days, then a 40% water change drops it back to ~24 ppm, and the cycle repeats. This is the "weekly 40% water change" rhythm of a typical healthy community tank. Calibrates steady-state bioload math: fish waste → NH3 → NO3 conversion rate, balanced against water-change dilution. Should scale cleanly to 100gal where margins are bigger and the rhythm is slower.

## Setup
- **Tank:** 150L (40 gal), gravel substrate, no lid (mesh top optional for jumpers)
- **Equipment:** Canister filter (large surface, ~1200 L/h = 8× turnover); heater at 26°C, 200W; light 40W on 10 hr/day (enough for low-light plants); no CO2, no air pump
- **Plants:** Modest — 3× Java Fern and 2× Amazon Sword, all starting ~50% size. Nutrient demand mostly low; they'll contribute some NO3 consumption but not enough to zero it out.
- **Stock:**
  - 20 × Neon Tetra (`neon_tetra`, 0.5 g each = 10 g)
  - 4 × Angelfish (`angelfish`, 15 g each = 60 g) OR 5 × Corydoras (`corydoras`, 4 g each = 20 g). **Primary scenario uses angels** (higher bioload, more stress-test). Corydoras is a variant.
  - Total bioload: ~70 g (angels variant)
- **Food regimen:** 0.5–0.7 g/day total (light but not stingy — feeds 20 small + 4 large fish). Split across one or two feedings.
- **Maintenance:**
  - **40% water change every 6 days** (weekly-ish). Primary calibration anchor.
  - Gravel vac during water change (removes ~30% of settled waste each time)
  - Top-off as needed for evaporation; no fertilizer dosing

## Expected timeline (real-world)

**Day 0 post-water-change:** NO3 at ~24 ppm (from the 60% that stayed after the 40% dilution of a previous cycle that ended at 40 ppm). NH3/NO2 at 0. Fish healthy, feeding well.

**Day 1–2 (ticks 24–48):** NO3 climbs by ~2.5–3 ppm per day. By 48 hr it's around 29–30 ppm. No stress visible. Plants quietly consume a small fraction (~0.5 ppm/day between them at 50% size, low-demand).

**Day 3–4 (ticks 72–96):** NO3 at 32–36 ppm. Still below stress threshold for all species. Waste visibly accumulating on gravel surface (~1–2 g of waste resource). Algae hovers stable — NO3 is elevated but plants + fish crop it and fresh filter keeps water column clear.

**Day 5 (tick 120):** NO3 at ~36–40 ppm. Approaching Vlad's trigger for maintenance.

**Day 6 (tick 144):** NO3 at ~38–42 ppm. Water change time. Vac gravel, remove 60L, refill with 60L tap water at 22°C. Post-change NO3 drops to ~24 ppm (0.6 × 40 = 24). Temperature dips briefly to ~24.3°C, recovers within an hour via heater. pH may tick up or down depending on tap chemistry but not dramatically.

**Cycle repeats:** Every 6 days, same sawtooth curve — 24 → 40 → 24 → 40 → 24 ppm.

**Over 4–6 weeks:** Equilibrium holds as long as feeding is consistent. Plants grow modestly (Java Fern slow, Amazon Sword medium). Fish health stable ≥90%. No algae bloom because nutrient availability is capped by the weekly reset. Bacteria populations steady at whatever fraction of carrying capacity matches the bioload (well below max because canister + gravel surface is oversized for this load).

## Numeric checkpoints

Reference: NO3 produced per day ≈ (fish waste mg N/day) / (150 L). At ~70 g bioload feeding 0.5 g/day, roughly 0.4–0.5 g/day of waste enters the system (some eaten and re-excreted as direct fish NH3, some uneaten → decay → NH3). Most converts through the cycle to NO3 within 24–48 hr. Expected daily NO3 rise: ~2.5–3.5 ppm/day after subtracting plant consumption. Over 6 days: ~16 ppm added, matching the 24 → 40 delta.

### Single 6-day cycle starting at NO3 = 24 ppm

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 0 | 0 | NO3 (ppm) | 24 | starting condition |
| 0 | 0 | NH3 (ppm) | 0 | cycled |
| 0 | 0 | NO2 (ppm) | 0 | cycled |
| 1 | 24 | NO3 (ppm) | 26–29 | +2.5 ±1 ppm/day |
| 1 | 24 | NH3 (ppm) | < 0.05 | bacteria processing in real time |
| 1 | 24 | NO2 (ppm) | < 0.05 | |
| 3 | 72 | NO3 (ppm) | 30–35 | linear climb |
| 3 | 72 | avg fish health | > 90 | comfortable |
| 5 | 120 | NO3 (ppm) | 34–40 | approaching target |
| 6 | 144 | NO3 (ppm) | 36–44 | pre-water-change peak |
| 6 | 144 | waste (g) | 1.5–4 | accumulated, ready for vac |
| 6 (after WC) | 144 | NO3 (ppm) | 22–26 | 60% of pre-WC value |
| 6 (after WC) | 144 | temperature (°C) | 24.0–25.0 | blend with 22°C tap over 60% retention |
| 6 (after WC) | 144 | waste (g) | reduced ~30% | from gravel vac |

### Multi-cycle stability (weeks 2–6)

| Week | Tick | Metric | Expected | Tolerance |
|------|------|--------|----------|-----------|
| 2 | 336 | pre-WC NO3 | 36–44 | same peak |
| 4 | 672 | pre-WC NO3 | 36–44 | stable rhythm |
| 4 | 672 | plant sizes | 55–75% | modest growth |
| 4 | 672 | algae | < 15 | stable low |
| 4 | 672 | fish alive | 24/24 | no deaths |
| 4 | 672 | avg fish health | > 88 | steady |
| 6 | 1008 | pre-WC NO3 | 36–44 | cycle hasn't drifted |
| 6 | 1008 | AOB population | stable, not growing | carrying capacity far from limit |

## Subsystems calibrated

- **Aggregate fish waste production → NO3** — primary calibration target. The 2.5–3.5 ppm NO3/day at this bioload:volume is the core number. Everything upstream (fish metabolism waste rate, food→decay→waste, waste→NH3 mineralization, NH3→NO2→NO3 bacterial conversion) compounds into this single observable.
- **Steady-state NH3/NO2 = 0** — confirms AOB/NOB have enough capacity to clear production in real time. Any transient spike above 0.05 ppm suggests the cycle can't keep up, which would be a bug at this bioload:surface ratio.
- **Water change dilution math** — 40% removal of dissolved mass (proportional), fresh water has 0 of the nitrogen compounds. Post-WC NO3 should be exactly 60% of pre-WC.
- **Temperature blending on water change** — 60L at 26°C + 60L at 22°C = ~24°C immediately post-WC. Heater then pulls back to 26°C over 1–2 hours (200W, 150L).
- **Plant NO3 consumption at low-demand steady state** — Java Fern + Amazon Sword at 50–70% size should pull ~0.3–0.7 ppm/day out. Not dominant, but noticeable. Without them, daily rise would be 3–4 ppm.
- **Gravel vac waste removal** — substrate clean action at moderate intensity should pull ~30% of waste stock.
- **Algae suppression at low-moderate NO3** — with NO3 oscillating 24–40 and light 10 hr/day, algae should stay < 20 indefinitely. Plants help.
- **Large-tank thermal stability** — 150L cools slowly on WC; temperature shouldn't swing more than ~1.5°C.
- **Fish health at NO3 ≤ 40** — should be neutral; angelfish hardiness 0.4 means they're sensitive to *spikes*, but sustained 40 ppm is still within "safe" (< 40 stress threshold per spec).

## Failure modes (diagnostic hints for the agent)

- **NO3 exceeds 60 ppm by day 6:** fish waste rate too high, OR not enough plant consumption, OR the waste → NH3 → NO3 pipeline is miscalibrated. The 2.5–3.5 ppm/day target is the anchor; if NO3 is climbing 6+ ppm/day, fish metabolism output is roughly 2× too hot.
- **NO3 stays flat at 24 ppm:** either fish are producing almost no waste (check metabolism multiplier), or plants are consuming ~100% of production (should be 10–20% at this plant biomass), or the N cycle isn't converting waste through (check stage 1 mineralization rate).
- **NH3 or NO2 ever exceeds 0.1 ppm:** the cycle can't keep up. Check AOB/NOB populations; they should be at a fraction of carrying capacity but well above what's needed. If populations are at 100% of carrying capacity and still spiking, processing rate per bacteria is too low.
- **Post-WC NO3 isn't exactly 60% of pre-WC:** water change dilution logic buggy. Pure mass-removal math should be deterministic.
- **Temperature swings more than 2°C on water change:** either the blend math is wrong or heater response is too slow. 200W should comfortably pull 150L up 2°C within an hour.
- **Angelfish die unexpectedly:** check NO3 stress threshold — spec says > 40 ppm is stress but 40–50 in transient peaks should not kill a hardiness-0.4 fish quickly. If health drops below 70 after one cycle, stress coefficient too harsh.
- **Nitrate peak drifts upward cycle-over-cycle:** the 40% WC should exactly reset each cycle to the same curve. If pre-WC peak climbs from 40 → 44 → 48 over successive weeks, residual waste on the gravel is feeding continuing NH3 mineralization between water changes at a rate that exceeds what plants + WC remove. Check whether gravel vac is actually reducing the waste stock.
- **Plants die:** at this level of nutrient demand and NO3 availability, plant condition should stay above 70. If Amazon Sword drops below 60, PO4 is probably too scarce (no dosing, only decay trace). Acceptable in this scenario — Vlad said "some plants, gravel" which implies low-demand focus.

## Variants

- **100gal scale** (380L, same bioload density — ~40 tetras + 8 angels, 1.2 g food/day): identical rhythm, same 40 → 24 ppm sawtooth, but with more thermal and chemical inertia. Post-WC temperature barely moves. Bacteria carrying capacity even more over-provisioned. Use this to confirm the model scales linearly with volume.
- **Skip the water change entirely:** NO3 climbs 2.5–3.5 ppm/day indefinitely, crossing the stress threshold (40 ppm) at day ~6–7 and the danger threshold (80 ppm) around day 20. Angelfish (hardiness 0.4) start losing health around day 10–14. Neons get sick but limp along. Algae bloom visible by week 3.
- **Corydoras instead of angels** (20 tetras + 5 cories = 30 g total): bioload ~2.3× lighter. NO3 climbs ~1 ppm/day. Pre-WC peak at 6 days around 30 ppm. Could stretch water changes to every 10–12 days.
- **Double feeding (1.0 g/day):** daily NO3 rise ~5–6 ppm. Hits 40 ppm in 4 days, not 6. Water change cadence shortens. Waste accumulates faster; more to vac.
- **No plants at all:** daily NO3 rise 3–4 ppm. Otherwise identical cycle rhythm. Confirms plant contribution is real but secondary.
- **Weekly 50% water changes instead of 6-day 40%:** post-WC NO3 at 20 ppm, pre-WC ~38–42 ppm at day 7. Nearly equivalent — slight edge in keeping peaks capped.
- **HOB filter instead of canister:** still plenty of surface for this bioload; NH3/NO2 stays at 0. Flow a touch lower. Gas exchange slightly better at surface. Negligible impact on NO3 rhythm.

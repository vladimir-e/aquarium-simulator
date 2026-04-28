# Scenario 2: Heavily Planted Equilibrium

> **Pending re-baseline.** The prescribed condition bands (e.g.
> "Variant B: MC 30–55 %, AS 55–75 %") were tuned against the
> pre-vitality homeostatic model (Task 40, PR #45). Vitality removes
> intermediate-condition steady states — plants heal to 100 % or
> decline. Bands below are preserved unchanged for historical
> reference; the upcoming calibration session will rewrite them
> against the current engine. Do not modify the numbers here.

10gal heavily planted tank — aqua soil, strong light, CO2 injection on a timer, canister filter with real flow, glass lid to kill evaporation. Five medium-to-high-demand plants (roughly 1 plant per 2 gallons, so 5 in a 10), 10 small fish (neon tetras) at very light feeding. The target state: a "walstad-ish but high-tech" equilibrium where plants consume NO3 and PO4 as fast as they're produced, nitrate sits in the single digits, algae is starved out, and the tank can coast for weeks without water changes. Two sub-scenarios matter for calibration: **(A) with EI dosing** — plants thrive, fast growth, carpet fills in; **(B) with fish waste only, no dosing** — plants survive but stall at mediocre condition, NO3 is still low, algae still suppressed but by a thinner margin. This is the primary plants-subsystem calibration.

## Setup
- **Tank:** 38L (10 gal), aqua soil substrate (~45,600 cm² surface at 1200 cm²/L), full glass lid (evaporation suppressed)
- **Equipment:** Canister filter (high surface, strong flow ~380 L/h = 10× turnover); heater at 25°C, 50W; light 15–20W high-output LED on 8 hr/day (shorter photoperiod is the high-tech convention to suppress algae); CO2 generator at 1.5 bps, schedule 7:00–17:00 (one hour before/after lights); no air pump (would off-gas CO2)
- **Plants:** 5 specimens, mixed demand to exercise the nutrient system:
  - 2× `amazon_sword` (medium demand, `sand`/aqua-soil-compatible)
  - 2× `monte_carlo` (high demand, aqua soil required — the carpet)
  - 1× `java_fern` (low demand, attached to hardscape)
  - Starting size 30–40% each. Target 60–80% at equilibrium.
- **Stock:** 10 × Neon Tetra (5 g total bioload)
- **Food regimen:** 0.05 g/day (lean — ~1× maintenance). This is Vlad's "minimal amount of food added regularly" target.
- **Maintenance:**
  - **Variant A (dosed):** 1 ml liquid fert daily via auto-doser (NO3:PO4:K:Fe ratio 5:0.5:2:0.1). No water changes.
  - **Variant B (undosed):** no fertilizer, no water changes — plants run on fish waste + substrate reserves alone.
  - Occasional top-off only to compensate for any micro-evaporation (minimal with full lid).

## Expected timeline (real-world)

### Variant A — EI dosed, high-tech equilibrium

**Week 1 (ticks 0–168):** Plants settle in after planting. Mild melt possible on Monte Carlo (don't penalize heavily — that's transplant shock, out of scope). Fish produce NH3, AOB/NOB establish quickly because aqua soil + canister media offer huge bacterial surface. Aqua soil leaches some NH4 for the first days; plants absorb it directly. Nitrate climbs to maybe 5 ppm, then plateaus.

**Week 2–3 (ticks 168–504):** Plants begin visible growth. Monte Carlo starts sending runners. Amazon Sword throws new leaves. CO2 pulls morning pH down to ~6.4, drifts back to ~6.8 overnight. NO3 steady at 5–10 ppm because consumption keeps pace with dosing + fish. Algae remains ≤5 (a slight diatom bloom in week 1 is normal and fades).

**Week 4–8 (ticks 672–1344):** Full equilibrium. Plants 70–90% size. Monte Carlo carpet coherent. Fish healthy. All nitrogen compounds at essentially zero except nitrate (low steady-state). Algae is starved out — new tank film doesn't appear on glass even without scraping.

### Variant B — Undosed, "mediocre but stable"

**Week 1–2:** Same initial cycling. Fish waste produces some NO3 and trace PO4 (1% of decayed mass per spec). K and Fe are zero — no source.

**Week 2–4:** High-demand plants (Monte Carlo) begin declining — no Fe means nutrient sufficiency caps around 30–40% even with plenty of NO3. Condition drops into the 40–60% range, growth nearly stops. Amazon Sword (medium demand, no Fe required to survive) hovers at 60–70% condition, growing slowly. Java Fern thrives (low demand, needs only NO3).

**Week 4–12:** Steady but depressing state. Monte Carlo doesn't die (condition stays above 30% thanks to NO3+PO4 from waste and residual K/Fe in aqua soil), but never carpets. Java Fern and Amazon Sword hold on. NO3 stays 3–8 ppm — low because even struggling plants consume some, and bioload is light. Algae hovers ≤10: plants aren't vigorous but they're occupying the nutrient niche; low NO3 and moderate light keep algae suppressed but not absent — expect a thin dusting on glass by week 8.

## Numeric checkpoints

### Variant A (dosed)

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 7 | 168 | NH3 (ppm) | < 0.1 | effectively zero, cycled |
| 7 | 168 | NO2 (ppm) | < 0.1 | cycled |
| 7 | 168 | NO3 (ppm) | 3–10 | dosing + fish, plants consuming |
| 7 | 168 | CO2 at midday (ppm) | 20–35 | injection active |
| 14 | 336 | NO3 (ppm) | 5–15 | steady-state band |
| 14 | 336 | PO4 (ppm) | 0.3–1.5 | |
| 14 | 336 | K (ppm) | 4–15 | |
| 14 | 336 | Fe (ppm) | 0.05–0.3 | |
| 14 | 336 | algae | < 8 | suppressed |
| 14 | 336 | avg plant condition | > 80 | thriving |
| 28 | 672 | avg plant size | 60–90% | substantial growth |
| 28 | 672 | NO3 (ppm) | 5–20 | stable |
| 28 | 672 | algae | < 10 | still suppressed |
| 28 | 672 | O2 midday (mg/L) | 8–11 | photosynthesis exceeds saturation |
| 28 | 672 | O2 pre-dawn (mg/L) | 5.5–7 | overnight respiration drop |
| 56 | 1344 | plant condition | > 80 | maintained |
| 56 | 1344 | NO3 (ppm) | 5–20 | no runaway |
| 56 | 1344 | algae | < 12 | |

### Variant B (undosed, fish-waste-only)

| Day | Tick | Metric | Expected | Tolerance |
|-----|------|--------|----------|-----------|
| 14 | 336 | NO3 (ppm) | 2–8 | low; limited by slow plant uptake |
| 14 | 336 | PO4 (ppm) | 0.05–0.4 | trace from decay only |
| 14 | 336 | K (ppm) | 0 | no source |
| 14 | 336 | Fe (ppm) | 0 | no source |
| 14 | 336 | Monte Carlo condition | 40–70 | declining |
| 14 | 336 | Java Fern condition | > 75 | fine |
| 28 | 672 | Monte Carlo condition | 30–55 | struggling, barely hanging on |
| 28 | 672 | Amazon Sword condition | 55–75 | mediocre but alive |
| 28 | 672 | Java Fern condition | > 75 | stable |
| 28 | 672 | algae | 3–15 | low but higher than Variant A |
| 56 | 1344 | Monte Carlo alive | yes | plant.condition > 10 |
| 56 | 1344 | avg plant size | 30–60% | stalled |
| 56 | 1344 | NO3 (ppm) | 2–10 | stable low |

## Subsystems calibrated

- **Plant photosynthesis math (Liebig's Law)** — nutrient sufficiency should be limited by Fe and K in Variant B for high-demand plants, dropping actual_rate to ~30% of potential. Variant A should run at near 100%.
- **Plant nutrient consumption in fert ratio** — consumption of NO3:PO4:K:Fe = 5:0.5:2:0.1 means iron depletes fastest. In Variant A this balances against dosing; in Variant B, absent K/Fe is the binding constraint.
- **Plant condition dynamics** — thriving/adequate/struggling/starving thresholds. In Variant A condition stays ≥80 because sufficiency ≥80%. In Variant B, high-demand plants sit in the 40–60 range (adequate/struggling boundary).
- **Algae suppression by plant consumption** — this is a critical behavior: healthy plants in Variant A should starve algae below 10 on the 0–100 scale; in Variant B algae is higher but still capped around 10–15 because nitrate stays low.
- **Nitrogen cycle at low bioload** — AOB/NOB carrying capacity vastly exceeds demand; NH3 and NO2 should be pinned at zero throughout.
- **Plant O2 production** — daily O2 oscillation, supersaturation possible mid-afternoon (8–11 mg/L) then drop overnight to 5.5–7.
- **CO2 injection → pH diurnal swing** — pH 6.4 at midday, 6.8 overnight, driven by CO2 off-gassing.
- **Aqua soil NH4 leaching (approximate)** — first week sees slightly elevated NH3 that plants consume. Acceptable to stub this out; real behavior approximates anyway because plants absorb ammonia/ammonium preferentially.
- **Evaporation → zero with full lid** — water loss should be < 1% over 28 days.
- **Fish metabolism at optimal conditions** — neons in 25°C, pH 6.4–6.8, NH3 0, NO3 < 20 should hold health ≥95% indefinitely.

## Failure modes (diagnostic hints for the agent)

- **NO3 climbs past 25 ppm in Variant A:** plant NO3 consumption rate too low, OR dosing amount too high for 5 plants at this size, OR photosynthesis nutrient_factor gating too aggressively.
- **Monte Carlo dies in Variant B within 2 weeks:** condition decay from nutrient insufficiency is too harsh. Spec says condition drops 0.5–1% per tick when sufficiency is 20–50%, which should take weeks to kill a plant starting at 100%, not days.
- **Algae > 20 in Variant A:** plants aren't consuming enough shared nutrient to starve algae. Check that algae growth depends on NO3 + PO4 + light multiplicatively — if any factor is zero-ish, algae should crash.
- **Algae < 2 in Variant B:** plants should be mediocre enough that algae has *some* foothold. If it's near zero, algae growth response is too timid.
- **O2 doesn't supersaturate at midday in Variant A:** plant photosynthesis O2 output too low at full thriving condition.
- **pH doesn't drop at least 0.3 units when CO2 hits 25+ ppm:** CO2-pH coupling too weak (known config issue — linear coefficient may need revisit).
- **K or Fe accumulates above optimal in Variant A:** plant consumption not tracking the fertilizer ratio, or plant size scaling off.
- **Plant condition stays at 100 in Variant B despite zero Fe and zero K:** Liebig's Law gating broken — sufficiency should cap at ~30–40% for high-demand plants missing two macros.
- **Fish health drops in Variant A:** something wrong with environment. pH swinging wide or CO2 dropping O2 below 4 at night are the likely culprits.

## Variants

- **No CO2 (low-tech planted)**: Same plants minus Monte Carlo (swap for more Java Fern/Anubias). Photoperiod drops to 7 hr. Equilibrium slower — 6–8 weeks to stable state. NO3 sits slightly higher (5–15 ppm) because plants grow slower and consume less. Growth rate maybe 1/3 of high-tech. Algae pressure higher.
- **Scale to 38L → 76L (20 gal):** Double the plant count (10 plants) and fish (20 neons), keep dosing proportional. All thresholds identical — this is the "plant mass per volume" formulation working. Margin of error larger in bigger tank.
- **Heavy fish load (30 neons in 10 gal):** Bioload doubles. In Variant A, plants may compete with dosing for NO3 — test that NH3/NO2 stay pinned, NO3 stays in 10–20 range. In Variant B, now fish-waste-only starts supplying enough N that medium-demand plants improve; but K and Fe are still missing, so high-demand still struggle.
- **Skip glass lid:** Evaporation kicks in, NO3/PO4/K/Fe all concentrate over time unless topped off. Calibration target: without top-off, 5% volume loss per week at 25°C / 22°C room.
- **CO2 timer failure (stuck off for 3 days):** Plant photosynthesis drops ~50% on day 1, condition starts declining slightly on day 2, visible (condition < 80) by day 3–4. Full recovery when CO2 resumes.

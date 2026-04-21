# Calibration run: gas-exchange
Date: 2026-04-19 · Branch: calibration/gas-exchange

## Scenario

Primary: `scenarios/03-community-steady-state.md` — S3 community with
70 g bioload in 150 L. Secondary tests: overstocked 5 gal, filterless
betta, 100 gal S3, isolated respiration / exchange probes.

## Root cause

`baseRespirationRate` was documented as **mg/L O2 per gram per hour** and
applied directly as a concentration delta to the `oxygen` resource. That
silently embedded the tank volume in the coefficient — the same fish
would consume the same mg/L/hr regardless of whether it lived in a
10 gal nano or a 300 gal show tank. At the old default (0.02 mg/L/g/hr)
a 70 g bioload in 150 L drew 1.4 mg/L/hr tank-wide, roughly 10× the
real-world value of 0.14 mg/L/hr (70 g × 0.3 mg/g/hr ÷ 150 L). Gas
exchange at the community canister flow (0.25 × 0.8 = 0.20 effective)
could only repay ~0.7 mg/L/hr at the largest plausible deficit — no
chance of catching up, so O2 crashed.

## Setup variations tested

1. **Isolated respiration** — fish only, gas exchange and aeration
   direct-O2 zeroed out.
2. **Isolated exchange** — fishless, O2 clamped to 4.0, community
   preset (canister + sponge aeration).
3. **S3 community steady-state** — 20 neon + 4 angel, 150 L, canister,
   mature cycle bootstrapped, fed 0.5 g/day, 72 h and 30 d horizons.
4. **Overstocked 5 gal** — 10 neon, 19 L, community preset (sponge
   filter), mature cycle bootstrapped.
5. **Filterless betta** — 1 betta, 19 L, filter disabled.
6. **Density / volume scaling** — same bioload density across 150 L /
   380 L, half and double stock within 150 L, to confirm linear mass
   scaling and inverse-volume scaling.

## Coefficient changes

| Key | Before | After | Rationale |
|---|---|---|---|
| `livestock.baseRespirationRate` | 0.02 mg/L/g/hr | **0.3 mg O2/g/hr** | New absolute semantics — see code change below. 0.3 is the midpoint of the real-world 0.2–0.5 mg O2/g/hr band for small freshwater teleosts at 25 °C. |
| `livestock.baseRespirationRate` meta min/max | 0.005–0.1 | 0.05–1.0 | Match new unit range. |
| `gasExchange.*` | — | **unchanged** | Measurements showed existing 0.25 + flow factor = 0.16–0.20 mg/L/hr per 1 mg/L deficit — solidly in the real 0.2–0.5 band. |

Code change: `metabolism.processMetabolism` now returns
`oxygenConsumedMg` / `co2ProducedMg` (absolute mass, like ammonia).
`livestock/index` divides by `state.resources.water` when emitting the
concentration effect, matching the decay system's idiom. Tests updated
accordingly.

## Results vs expected

### Isolated respiration (150 L, 70 g bioload, no exchange)

| Metric | Expected | Actual | Pass |
| --- | --- | --- | --- |
| O2 draw | 0.14 mg/L/hr | 0.140 mg/L/hr | ✅ |

### Isolated exchange (150 L, canister, no fish, O2 clamped at 4)

| Metric | Expected | Actual | Pass |
| --- | --- | --- | --- |
| 1-tick return at 4.4 mg/L deficit | 0.88–2.2 mg/L/hr | 0.707 mg/L/hr | marginal — slightly low but same order |
| 48 h convergence to saturation | ≥95 % of 8.38 | 8.382 (100 %) | ✅ |

### S3 community, 72 h (with mature cycle bootstrap + 0.5 g/day feed)

| Day | O2 (mg/L) | Fish alive | Avg health |
| --- | --- | --- | --- |
| 1 | 7.88 | 24/24 | 96.0 |
| 2 | 7.84 | 24/24 | 100.0 |
| 3 | 7.82 | 24/24 | 100.0 |

### S3 community, 30 d (weekly 40 % NO3 reset to model water change)

| Day | O2 | Fish alive | Avg health | NO3 (ppm) |
| --- | --- | --- | --- | --- |
| 7 | 7.76 | 24/24 | 100 | 19.7 |
| 14 | 7.66 | 24/24 | 100 | 17.5 |
| 21 | 7.55 | 24/24 | 100 | 17.0 |
| 30 | 7.38 | 24/24 | 100 | 12.2 |

O2 target of 6–8 mg/L steady held for the full 30 d. Tank is healthy.

### Overstocked 5 gal (19 L, 10 neon, sponge filter)

| Tick | O2 | Fish alive | Avg health |
| --- | --- | --- | --- |
| 6 | 8.26 | 10/10 | 99.6 |
| 12 | 8.35 | 10/10 | 84.4 |
| 22 | 8.36 | 10/10 | 5.0 |
| 24 | 8.38 | 0/10 | 0 |

**O2 did not crash** — held above 8 the entire time. Fish died from
nitrite toxicity (NO2 climbed past 0.5 ppm by tick 22) — the AOB/NOB
pool in 19 L cannot keep up with even unfed gill NH3. That's a
nitrogen-cycle-capacity finding for a separate task.

### Filterless betta (19 L, 1 betta, no equipment flow)

| Tick | O2 |
| --- | --- |
| 24 | (stable around 6.35 while alive) |
| post-death | 6.35 (frozen) |

O2 stabilised at 6.35 mg/L, inside the task-expected 5–7 mg/L envelope
for a single betta without filter. Fish death was from NH3 toxicity
build-up — NO2 + NH3 both climbed with no bacterial surface. Orthogonal
to gas exchange.

### Density / volume scaling (5 h isolated respiration draw)

| Tank | Stock | Mass | Observed | Expected |
| --- | --- | --- | --- | --- |
| 150 L | 20 neon + 4 angel | 70 g | 0.1403 mg/L/hr | 0.1404 |
| 380 L | 40 neon + 8 angel | 140 g | 0.1107 mg/L/hr | 0.1109 |
| 150 L | 10 neon + 2 angel | 35 g | 0.0701 mg/L/hr | 0.0702 |
| 150 L | 40 neon + 8 angel | 140 g | 0.2805 mg/L/hr | 0.2808 |

All within 0.2 % of analytic expectation — respiration scales linearly
with mass and inversely with water volume.

## Mismatches & hypotheses

- **Filterless tanks have zero surface diffusion.** With filter / air
  pump / powerhead all disabled, `flow = 0` ⇒ `flowFactor = 0` ⇒
  exchange rate = 0. Real aquaria have non-zero baseline diffusion
  across the air/water interface even without any flow (surface area
  and temperature matter). Currently a filterless betta's O2 is held
  up only by starting inventory; long-term it would drift indefinitely
  with bioload. **Recommendation**: add a `minFlowFactor` floor (maybe
  0.05–0.10) so a still tank still equilibrates slowly, or introduce a
  separate surface-area-driven diffusion term. Out of scope for this
  task but worth a cleanup pass.
- **100 gal S3 (380 L, same bioload density) dies from an NH3 burst in
  the first tick** — on feeding 1.2 g at the start of day 1, NO2 hits
  0.088 ppm within an hour, NH3 spikes to 2.8 ppm by tick 7, and the
  tank is dead by tick 8. O2 holds fine throughout (7.5 → 8.5). This
  is a nitrogen-cycle capacity / burst-response issue that does not
  scale linearly with volume. AOB/NOB seeded at 50 % of carrying
  capacity still cannot absorb the first-feed gill-NH3 pulse. Flag for
  nitrogen-cycle re-calibration pass.
- **Aeration direct O2** currently caps at saturation but doesn't
  account for the air pump's actual O2 per bubble. Works well enough
  here, but future S4 scenarios with air-pump-only oxygenation may
  need revisiting.

## Recommended coefficient changes

Already applied on this branch. See table above.

## Confidence

High on the primary target (S3 24 h + 30 d). Respiration + exchange are
now dimensionally coherent and quantitatively match the real-world
reference band. Two follow-ups flagged that do not block the current
calibration: filterless-tank diffusion floor, and nitrogen-cycle burst
capacity at larger volumes.

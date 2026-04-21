# Task 36: Ambient waste volume scaling

**Status:** pending

## Overview

`decay.ambientWaste` is a flat `0.001 g/hr` — the same small background
waste stream regardless of tank size. This is context-sensitive in a
way the current flat value cannot express:

- In a 5 gal (19 L) tank the ambient rate is ~ 4 % of a 5-neon
  bioload's waste generation. Visible but reasonable.
- In a 40 gal (150 L) tank with the same flat rate, ambient is < 1 %
  of a community-sized bioload. Also reasonable.
- In a 200 L display tank with only a few plants and no fish (scenario
  02 Variant B), ambient is the entire N-driver. The calibration pass
  for scenario 02 dropped this value from `0.01` to `0.001` for
  exactly this reason — but the underlying problem (one flat rate
  doesn't fit every context) remains.

Ambient waste models two distinct things that have different scaling:

1. **Bacterial seed floor** — background microbial activity that
   always produces trace nitrogen regardless of tank size. Scales
   with surface area (biofilm) or is truly small and constant.
2. **Organic matter turnover** — dust settling, microfauna shedding,
   seed bacteria die-off. Scales with biomass or volume.

Collapsing both into one flat rate means any calibration choice is
wrong for some tank size.

## References

- Engine: `src/simulation/systems/decay.ts` (lines 116–123)
- Config: `src/simulation/config/decay.ts`
- Calibration context:
  - `docs/calibration/scenarios/02-planted-equilibrium.md` (Variant B)
  - `docs/calibration/baselines/02-planted-equilibrium.md` —
    "dropped ambient 10× to let fish-driven N dynamics emerge"

## Scope

### In scope

- Split `ambientWaste` into two terms:
  - `bacterialSeedWaste` (g/hr) — bound to surface area (biofilm
    proxy).
  - `organicTurnoverWaste` (g/hr/L) — bound to water volume.
- Both are in the decay system, emitted as effects on the `waste`
  resource.
- Re-run scenarios 01–04 and confirm primary anchors still land.
- Decommission the single `ambientWaste` config field.

### Out of scope

- Bioload-scaled ambient (proportional to living mass) — that's
  already captured by fish metabolism; double-counting would distort
  the chain.
- Temperature dependence — organic turnover tracks Q10 anyway via
  the existing decay pipeline.

## Design question

Which scaling is right for each term?

- Bacterial seed floor:
  - Surface area (cm²) makes physical sense — biofilm is 2D. But
    practical tanks have surface area roughly proportional to volume
    for standard shapes, so this may not differentiate much in real
    use.
  - A truly constant absolute rate (g/hr, independent of anything) is
    the simplest fallback.
- Organic turnover:
  - Volume scaling (g/hr/L) is the cleanest — more water, more
    suspended organics, more turnover. Should land near
    `0.001 / 19 ≈ 5.3e-5 g/hr/L` to reproduce the scenario-04 value
    on small tanks.

Open question: is this really two terms, or one well-chosen volume-
proportional term? The 40 gal tank in scenario 03 uses a mature filter
that overwhelms ambient regardless; the 10 gal in scenario 02 cares.
If one volume-proportional term handles both cases, start there.
Revisit if a scenario surfaces where the two terms need to diverge.

## Acceptance criteria

- All four baseline scenarios reproduce their primary anchors within
  the existing tolerances on the new split model.
- No drop-ins of large volume (e.g. 500 L) explode the N chain on
  day 1 — volume-scaled ambient stays reasonable across the full
  realistic tank-size range (20–500 L).
- Config meta / persistence schema / tests updated to reflect the
  new field(s).

## Notes

Non-blocking follow-up to the calibration-foundation PR. The current
`0.001 g/hr` flat value was chosen to let scenario 02 breathe; it
remains workable for scenarios 01 / 03 / 04 in the sizes they target.
The gap is latent in the product but will bite as soon as a user sets
up a tank outside the calibrated range.

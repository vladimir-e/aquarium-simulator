# Task 37: Substrate leaching as a first-class engine mechanic

**Status:** pending

## Overview

Aqua soil substrates (ADA Amazonia, UNS Controsoil, Tropica Soil)
release ammonium and other nutrients for weeks after setup. The initial
leach is substantial — 5–15 ppm NH4 for the first few days, tapering
over 3–6 weeks. For planted tanks this is the primary nitrogen source
while the cycle establishes; skipping it means the engine under-models
a major stage of planted-tank setup.

Currently the simulator treats every substrate as chemically inert —
it only provides a hardscape bonus and potentially surface area. The
calibration CLI has a workaround: a runner-side stub that injects an
artificial NH3 profile when a scenario specifies "aqua soil". This
keeps scenarios runnable but leaks the mechanic out of the engine,
and any non-calibration-CLI path (the web UI, game mode) silently
loses the behaviour.

## References

- Specs: `docs/3-EQUIPMENT.md` (substrates subsection),
  `docs/5-RESOURCES.md` (ammonia / nitrate mass model)
- Engine: `src/simulation/equipment/substrate.ts`
- Calibration scenario: `docs/calibration/scenarios/02-planted-equilibrium.md`
  — Variant A expected behaviour includes an initial NH4 pulse
- Current workaround:
  `calibration-tmp/` probes that manually seed NH3 at tick 0

## Scope

### In scope

- Per-substrate leach profile, expressed as:
  - `initialLeach` (g NH4-N per kg substrate, optionally other
    nutrients like PO4 / K)
  - `leachHalfLife` (hours) — exponential decay of the leach rate
- `Substrate` effect runs in the PASSIVE tier, emits NH4 mass directly
  into the ammonia pool, decays its remaining reserve each tick.
- Substrate mass (or coverage area) is a config input — so 2 kg of
  ADA soil leaches 10× more than 0.2 kg of Tropica.

### Out of scope

- Physical substrate layers (cap gravel over soil) and diffusion.
  Model as a single homogenised leach source.
- Re-leach after disturbance (gravel vac, uprooting) — future work.
- Biogenic substrate chemistry (bacterial action deep in the
  substrate) — the nitrogen cycle system already handles that via
  bacterial surface area.

## Design

Each substrate species gets a `leachProfile` in
`SUBSTRATE_SPECIES_DATA`:

```ts
ada_amazonia: {
  name: 'ADA Amazonia',
  initialLeachPerKgNH4_N: 1.5, // g of N per kg substrate
  leachHalfLifeHours: 24 * 14,  // 2 weeks
  // ... existing fields
}
```

State gains `substrate.remainingLeach` (kg-equivalent N reserve). Each
tick, substrate emits:

```
nh4N_emitted = substrate.remainingLeach × ln(2) / leachHalfLifeHours
substrate.remainingLeach -= nh4N_emitted
```

Converted to NH3 compound mass via `MW_NH3 / MW_N`. Stays in the
ammonia pool as usual, fish-health and bacteria then treat it
identically to metabolic or feeding-derived NH3.

## Acceptance criteria

- A fresh ADA Amazonia setup produces a measurable NH3 pulse on day 1
  (scenario 02 Variant A now matches without the runner-side stub).
- Leach decays smoothly; after 6 weeks, remaining reserve is < 5 % of
  initial and emissions are negligible.
- Inert substrates (gravel, sand) show zero leach — baseline
  unchanged.
- Persistence schema updated, version bumped.
- `calibration-tmp/` stub removed; the scenario 02 Variant A runner
  uses the engine-native path.

## Notes

Non-blocking follow-up. Current calibration scenarios survive without
this because they use either (a) inert substrate (gravel) or (b) a
runner-side stub. Filing this as a task so the engine stops having a
known omission in a very common real-world setup.

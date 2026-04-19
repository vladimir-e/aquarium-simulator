# Task 30: Filterless surface diffusion

**Status:** completed

## Overview

The gas-exchange calibration in Task 29 surfaced an engine bug: when all
flow-producing equipment (filter, air pump, powerhead) is disabled,
`flow = 0` so `flowFactor = 0` and the exchange rate collapses to zero.
Real aquaria have baseline air/water diffusion across the still surface
regardless of flow — low rate, but non-zero — so a filterless betta in
a 5 gal should still sit comfortably at 5–7 mg/L O2 indefinitely
instead of drifting down with bioload and never recovering.

Add a minimum passive-diffusion contribution to gas exchange so
filterless setups behave realistically.

## References

- `docs/tasks/29-gas-exchange-calibration.md` — prior gas-exchange fix
  and the flag that motivates this task.
- `docs/calibration/runs/2026-04-19-gas-exchange.md` — Mismatches &
  hypotheses §1 ("Filterless tanks have zero surface diffusion").
- `docs/calibration/scenarios/04-low-volume-stressors.md` — Variant A
  is the canonical filterless-betta reference setup.

## Scope

### In Scope

- `src/simulation/config/gas-exchange.ts` — add a `minFlowFactor`
  tunable with metadata for UI wiring parity with other coefficients.
- `src/simulation/systems/gas-exchange.ts` — clamp the computed flow
  factor to the configured minimum so `flowFactor` is never below the
  floor, even with zero flow.
- `src/simulation/systems/gas-exchange.test.ts` — unit tests for the
  new floor behaviour and regression tests confirming existing
  high-flow / zero-flow behaviour still lines up (zero-flow now emits
  small non-zero exchange effects).

### Out of Scope

- CLI, scenarios, presets, UI, other subsystems.
- Reworking the flow formula shape — approach (A) in the task brief
  (a floor) is preferred over approach (B) (a separate surface-area
  diffusion term). Refactor to (B) later if the floor proves too
  coarse.
- Aeration direct-O2 path (already handles its own no-flow injection).

## Implementation

Approach **(A) — floor on `flowFactor`**:

- Add `minFlowFactor` to `GasExchangeConfig`, default `0.1` (10 % of
  full-flow exchange). Physical intuition: still-surface diffusion in
  a typical nano is roughly 5–15 % of the rate you'd get with gentle
  filter flow. 0.1 is the middle of that band and a round number for
  tuning.
- Add `minFlowFactor` to `gasExchangeConfigMeta` with sensible UI
  bounds (0.0 – 0.3, step 0.01).
- In `calculateFlowFactor`, after computing `turnovers /
  optimalFlowTurnover` and clamping to `1.0`, floor the result at
  `config.minFlowFactor`. Keep the `tankCapacity <= 0` guard returning
  `0` — a tank with no capacity has no surface either.
- Do **not** change `calculateGasExchange`, aeration, or the system
  update loop — the floor propagates through naturally.

Why this is clean:

- One knob, one clamp, one config field. The physics shape of the
  formula is unchanged.
- The CO2 off-gassing path uses the same `flowFactor` so it gets the
  passive-diffusion floor for free, which is correct — CO2 equilibrates
  passively with air at the same surface.
- The aeration `aerationDirectO2` already handles the no-flow case for
  active air-pump oxygenation, so we don't duplicate that path.

## Acceptance Criteria

- [x] `calculateFlowFactor(0, 20, { ...defaults })` returns
  `minFlowFactor` (not 0).
- [x] `calculateFlowFactor(<<optimal>>, 20)` still returns `1.0`.
- [x] `calculateFlowFactor(flow, 0)` still returns `0` (degenerate
  tank).
- [x] Gas-exchange system emits a small non-zero O2 effect when flow
  is 0 and the tank is under-saturated.
- [x] Existing "no aeration + no flow ⇒ no effects" expectation is
  reframed into "no effects only if tank is at equilibrium". The test
  is rewritten to reflect the new behaviour.
- [x] Filterless 5 gal betta (Scenario 4 Variant A, no plants) holds
  O2 at ~7.6 mg/L while the fish is alive over 72 h; does not crash.
  (Fish dies from NH3 at tick 24 — orthogonal nitrogen-cycle issue.)
  With Anubias added, O2 dips to ~6.9 then recovers to ~7.9 — no
  oscillation.
- [x] S3 community with canister holds O2 at 7.94–8.04 mg/L across
  72 h — no regression; floor is below the canister's flow factor
  (~0.8) so the clamp is a no-op in that regime.
- [x] `npm run lint`, `npm run build`, full `npx vitest run` all pass.
- [x] `npx tsx src/cli/sim.ts smoke` still passes.

## Tests

- Unit tests in `src/simulation/systems/gas-exchange.test.ts` for the
  new floor behaviour on `calculateFlowFactor` and the system update.
- Update the `creates no effects with zero flow and no aeration` test
  — now exchange should be non-zero when current ≠ target.

## Notes

- Value to pick: start at `minFlowFactor = 0.1`. The filterless-betta
  steady state from the Task 29 run already landed at 6.35 mg/L (held
  there by the fish dying early, so the current zero-exchange regime
  didn't get a chance to drift). With passive diffusion restored, the
  tank should hold around saturation minus whatever the fish draws,
  well within the 5–7 envelope for a 3 g betta.
- If the filterless baseline comes out too hot (O2 pinned at
  saturation) bump the floor down; too cold (drifts below 5) bump up.

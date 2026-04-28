# Task 42: Remove pre-CLI calibration scaffolding

**Status:** completed

## Overview

Task 24 (`docs/tasks/24-calibration-scenarios.md`) introduced
`src/simulation/calibration/` with `runScenario` / `createCycledTank` /
`addFish` / `addPlants` / `setAmmoniaPpm` / `addAmmonia` helpers and a
smoke test. Task 25 (`docs/tasks/25-calibration-cli.md`) replaced this
approach with a stateful, agent-driven CLI in `src/cli/` and a
workflow under `docs/calibration/` (README, scenarios/, baselines/,
runs/). The old in-code helpers and smoke test are dead code; only
the N-mass-conservation invariant test still references two of them.

Per the project's no-backward-compat rule, remove the old scaffolding
completely and inline the still-used helpers into their lone consumer.

## References

- `docs/tasks/24-calibration-scenarios.md` (deleted by this task)
- `docs/tasks/25-calibration-cli.md` (the replacement)
- `docs/calibration/README.md` (current workflow)
- `src/cli/sim.ts` (replacement entry point)
- `src/simulation/tests/n-mass-conservation.test.ts` (sole consumer)

## Scope

### In Scope

- Delete `src/simulation/calibration/` (both `helpers.ts` and `smoke.test.ts`).
- Delete `docs/tasks/24-calibration-scenarios.md` — its spec no
  longer matches reality.
- Inline `createCycledTank` and the deterministic `addFish` (the
  jitter-neutralising variant for invariant testing) into
  `src/simulation/tests/n-mass-conservation.test.ts`.
- CHANGELOG entry.

### Out of Scope

- `src/cli/` — the replacement, untouched.
- `docs/calibration/` — current workflow docs, untouched.
- All other tests and engine code.

## Implementation

- Inline two ~25-line helpers into the only consumer; the inlined
  `addFish` keeps the comment block explaining why it neutralises
  hardiness/health jitter (deterministic invariants vs. game-side
  stochasticity).
- The test imports `createSimulation`, `getMassFromPpm`,
  `nitrogenCycleDefaults`, `SimulationConfig`, and `FishSpecies` from
  their canonical locations — no compatibility shims.
- Drop the `../calibration/helpers.js` import.

## Acceptance Criteria

- `src/simulation/calibration/` is gone.
- `docs/tasks/24-calibration-scenarios.md` is gone.
- `n-mass-conservation.test.ts` passes with the inlined helpers.
- `npm run lint`, `npm test`, `npm run build` all pass.
- `npx tsx src/cli/sim.ts smoke` still runs end-to-end.
- CHANGELOG updated.

## Tests

- Existing `n-mass-conservation.test.ts` continues to pass — the
  inlined helpers are line-for-line equivalent to the deleted ones
  for the call sites in this file.

## Notes

- Parallel cleanup branch may touch CHANGELOG — trivial conflict on
  rebase is acceptable.

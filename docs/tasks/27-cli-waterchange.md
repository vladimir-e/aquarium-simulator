# Task 27: CLI waterChange accepts arbitrary fractions

**Status:** completed

## Overview

`sim action waterChange <x>` previously snapped the requested fraction to the nearest of `[0.1, 0.25, 0.5, 0.9]`, which made common values like 40% impossible to test (they would snap up to 50%). The engine's water-change physics is continuous — any fraction in (0, 1] is a valid replacement — so the snap was an artificial constraint leaking UI step-button semantics into the CLI and the engine type system.

Remove the snap in the CLI, loosen the engine's `WaterChangeAmount` type to `number`, and keep the `WATER_CHANGE_AMOUNTS` list strictly as UI step buttons.

## References

- Engine action: `src/simulation/actions/water-change.ts`
- Action types: `src/simulation/actions/types.ts`
- CLI dispatcher: `src/cli/sim.ts` (`buildAction`)
- UI step buttons: `src/ui/components/actions/WaterChangeCard.tsx`

## Scope

### In Scope

- `buildAction('waterChange', …)` in `src/cli/sim.ts` — replace snap with straight validation (clamp semantics: `0 < frac ≤ 1`; percent inputs `>1` divided by 100).
- `WaterChangeAmount` type widened from literal union to `number`; JSDoc updated in both `water-change.ts` and `types.ts`.
- New unit tests:
  - CLI: `src/cli/__tests__/build-action.test.ts` — parses arbitrary percent/fraction, rejects invalid inputs.
  - Engine: arbitrary-fraction assertions in `src/simulation/actions/water-change.test.ts` (40% and 100% cases).

### Out of Scope

- Scenario files, calibration runs, any other CLI commands.
- The UI card's step-button picker — `WATER_CHANGE_AMOUNTS` stays as a preset list for the UI.
- Engine correctness rules beyond the existing `amount > 0 && amount <= 1` check.

## Implementation

- CLI: parse `args[0]` as a number; if `>1` divide by 100; reject `≤0`, non-finite, or `>100%`; pass through as `{ type: 'waterChange', amount: frac }`. Export `buildAction` so it can be tested directly.
- Engine type: `export type WaterChangeAmount = number` with a JSDoc that documents the (0, 1] runtime bound. `WATER_CHANGE_AMOUNTS` stays (same value, `readonly number[]`) as UI presets.
- No changes needed in `WaterChangeCard.tsx` or `Actions.tsx` — the existing code compiles unchanged under the widened type.

## Acceptance Criteria

- `sim action waterChange 40` replaces exactly 40% of tank volume (asserted via unit test).
- `sim smoke` passes.
- `npm run lint`, `npm test`, `npm run build` all pass.
- `CHANGELOG.md` updated.

## Tests

- `src/cli/__tests__/build-action.test.ts` — new.
- `src/simulation/actions/water-change.test.ts` — added `arbitrary fractions` describe block (40%, 100%).

## Notes

- The `as WaterChangeAmount` cast in `WaterChangeCard.tsx` is now a no-op but kept to preserve call-site intent ("this number represents a water-change fraction"). No behavioral difference.
- This is the reverse direction of the task-15 design decision that pinned the type to 4 literal values — motivated there by UI step buttons, but the engine was never the right place for that constraint.

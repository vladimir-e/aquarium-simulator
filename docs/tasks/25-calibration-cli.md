# Task 25: Calibration CLI

**Status:** completed

## Overview

Build a slim stateful CLI that lets agents drive the simulation engine for calibration work — create tanks, add livestock, tick time forward, observe state, collect traces, and tweak tunable config. Session state persists in `.simstate/current.json` so subsequent commands operate on the same simulation.

## References

- Engine API: `src/simulation/index.ts`
- Tunable config: `src/simulation/config/index.ts` (`DEFAULT_CONFIG`, `TunableConfig`)
- Presets: `src/ui/presets.ts` (`PRESETS`)
- Calibration helper prior art: `src/simulation/calibration/helpers.ts`
- Calibration scenarios: `docs/calibration/scenarios/*.md`

## Scope

### In Scope

- `src/cli/` directory with entry `sim.ts` and focused modules: `session`, `duration`, `format`, `history`, `smoke`.
- CLI surface: `new`, `add`, `remove`, `tick`, `observe`, `trace`, `config get/set`, `action`, `smoke`.
- Per-tick history recorded into the session file (cap 720 entries).
- Session file at `.simstate/current.json` (gitignored).
- Vitest coverage: `duration`, `session`, `smoke`.
- Workflow README at `docs/calibration/README.md` plus report template.

### Out of Scope

- Session branching, diff/compare, plotting, auto-calibration loops, web integration.
- Changes to engine code or existing tests.

## Implementation

- Entry point `src/cli/sim.ts` uses `process.argv` parsing — no CLI framework dep. Run via `npx tsx src/cli/sim.ts <args>`.
- `session.ts` owns load/save of `.simstate/current.json`. Session shape: `{ version, createdAt, name, config, state, history[] }`. Save atomically (write to `*.tmp` then rename).
- `duration.ts` parses `5d`, `48h`, integer-as-hours — exports `parseDuration`.
- `history.ts` builds per-tick snapshots (resources, fish count/avg-health, plants count/avg-condition) and drives the tick loop. Cap history at 720 entries (drop oldest when exceeded).
- `format.ts` renders `observe` markdown (tight <30 line snapshot) and `trace` CSV (converts ammonia/nitrite/nitrate mass to ppm on request).
- `smoke.ts` scripts a short scenario that exercises every command via the same code paths — callable from CLI and from vitest.
- Only imports from `src/simulation/index.ts` and `src/simulation/config/index.ts`. No engine reimplementation, no parallel types.

## Acceptance Criteria

- All CLI subcommands function end-to-end.
- `sim smoke` runs clean from the CLI and as a vitest test.
- `npm run lint`, `npm test`, `npm run build` all pass.
- `.simstate/` and `docs/calibration/runs/` added to `.gitignore`.
- `CHANGELOG.md` updated with task summary.

## Tests

- `src/cli/__tests__/duration.test.ts` — parsing table.
- `src/cli/__tests__/session.test.ts` — load/save roundtrip, history cap behaviour.
- `src/cli/__tests__/smoke.test.ts` — runs the full scenario and asserts no throws plus key invariants.

## Notes

- `topOff` action has no parameters; extra args to `action topOff` are accepted but ignored.
- `waterChange` takes a discrete fraction (0.1 / 0.25 / 0.5 / 0.9). CLI accepts percent or fraction and normalises.
- `dose` takes `amountMl`; `action dose <ml>` is the interface. (Spec's "dose nitrogen 1" reframed as ml since the engine only models fertilizer ml — flagged in summary.)
- `scrubAlgae` accepts an optional deterministic percent (0.1–0.3) via `randomPercent`. CLI passes `scrubAlgae <percent>` straight through normalised to that range.

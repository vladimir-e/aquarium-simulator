# Task 41: Extract game UI to a separate repo

**Status:** completed

## Overview

The game UI scaffolded under `/game` in Task 23 is being moved to a
separate, non-open-source repository. This repo continues to host the
simulation engine, the calibration CLI, and the control-panel UI at
`src/ui/` (deployed to https://sim.fishroom.app via Vercel). Game-side
code, configs, dependencies, and the Task 23 spec are removed cleanly
— per project policy, "no backward compatibility, as if it never
existed."

## References

- Original scaffolding spec (deleted in this task): `docs/tasks/23-game-ui-foundation.md`
- Vercel deploy config (unchanged): `vercel.json` builds `npm run ui:build`

## Scope

### In Scope

- Delete `/game` directory in full (components, hooks, tests, entry
  point, README, assets).
- Delete `vite.game.config.ts` and `vitest.game.config.ts`.
- Delete `docs/tasks/23-game-ui-foundation.md` — its scope no longer
  matches reality.
- Trim game-only npm scripts from `package.json`:
  `dev:game`, `build:game`, `preview:game`, `test:game`,
  `test:game:watch`.
- Drop the `'game/**/*.{ts,tsx}'` glob from the `lint` and
  `lint:fresh` scripts.
- Remove game-only dependencies: `pixi.js`, `framer-motion` (verified
  game-only via grep before removal).
- Remove the `dist-game/` line from `.gitignore` and the
  `'dist-game/**'` ignore entry in `eslint.config.js`.
- Strip the `game/**` files glob from `eslint.config.js`.
- Regenerate `package-lock.json` via `npm install`.

### Out of Scope

- Any change to `src/`, `src/ui/`, `src/cli/`, `docs/calibration/`,
  or simulation engine code.
- The receiving repo for the game — separate effort.

## Implementation

- `package.json`, `eslint.config.js`, `.gitignore` edited in place.
- Whole-tree `rm -rf game/` plus targeted file deletions for the two
  Vite/Vitest game configs and the Task 23 spec.
- `npm install` after edits to refresh the lockfile.

## Acceptance Criteria

- `npm run lint` passes.
- `npm test` passes (engine + UI tests, no game tests).
- `npm run build` produces the engine `dist/` cleanly.
- `npm run ui:build` produces `dist-ui/` cleanly — Vercel deploys
  from this and must continue to work.
- No file outside `src/`, `docs/`, `tests/`, `scripts/`, and the
  config files at root references the deleted `game/` directory.

## Tests

Existing engine and UI test suites cover this — no new tests added.
The success signal is the four validation commands above.

## Notes

The Task 23 CHANGELOG entry (2026-02-04, "Game UI Foundation")
remains as a historical record. The new entry for this task notes
the extraction so future readers understand the game wasn't
abandoned, just relocated.

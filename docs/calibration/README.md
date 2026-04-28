# Calibration workflow

This directory holds the materials and runs for tuning the simulation engine
against expected real-tank behaviour. Calibration agents drive the engine
through the **`sim` CLI** (`src/cli/sim.ts`), observe outputs, and propose
coefficient changes back in `src/simulation/config/*.ts`.

> **Status: drifted from engine.** Several fundamental mechanics have
> landed since the last baseline pass — vitality model (Task 40,
> PR #45) replaces homeostatic plant condition with heal-or-decline,
> per-species maxSize gates growth, fish hardiness offset, etc. The
> baselines and scenarios here document the engine *as it was*, not as
> it is. A consolidated re-baseline session is planned once the
> remaining mechanics tasks (Tasks 34, 37, 38, 39, ...) settle, so the
> pass can absorb every change at once instead of being repeated for
> each. Until then, treat calibration files as historical context.

## Inputs

- `scenarios/` — the canonical calibration scenarios (markdown). Each file
  describes setup, expected checkpoints, and acceptance criteria.
- `baselines/` — committed, canonical convergent run per scenario. These are
  the in-tree evidence that the engine matches each scenario's primary
  anchors. One file per scenario, named `NN-<scenario-slug>.md`.
- `runs/` — ephemeral, per-run reports authored during calibration work
  (gitignored). Use this folder for work-in-progress reports, alternative
  variants, and debugging runs. Promote a notable run into `baselines/`
  once it converges and represents the current engine's behaviour.

## The CLI

The CLI is stateful. It keeps the current session in `.simstate/current.json`
so every command operates on a continuous simulation until a new session is
created.

```bash
# Bootstrap a session from a preset
npx tsx src/cli/sim.ts new --preset=planted --tank-gal=10 --name=my-run

# Populate and tick
npx tsx src/cli/sim.ts add plant --species=amazon_sword --size=0.5
npx tsx src/cli/sim.ts add fish --species=neon_tetra --count=6
npx tsx src/cli/sim.ts tick 5d

# Inspect
npx tsx src/cli/sim.ts observe
npx tsx src/cli/sim.ts trace --fields=temperature,ph,nh3_ppm,no3_ppm --every=1d

# Drive actions
npx tsx src/cli/sim.ts action feed 0.5
npx tsx src/cli/sim.ts action waterChange 40
npx tsx src/cli/sim.ts action dose 1

# Tweak tunables
npx tsx src/cli/sim.ts config get nitrogenCycle
npx tsx src/cli/sim.ts config set nitrogenCycle.bacteriaPerCm2 260

# End-to-end wiring check
npx tsx src/cli/sim.ts smoke
```

Durations accept `5d`, `48h`, or a bare integer (hours).

## Branches

One branch per scenario: `calibration/<scenario-slug>`. Commit coefficient
changes and run reports on that branch. Keep simulation logic unchanged —
calibration only touches `src/simulation/config/*.ts` and scenario tests.

Before committing: run `npx tsx src/cli/sim.ts smoke` and `npm test` to make
sure nothing breaks.

## Report template

Save reports into `docs/calibration/runs/<YYYY-MM-DD>-<slug>.md` (gitignored
by default). Once a run converges and you're ready to commit it as the
canonical reference, copy it into `docs/calibration/baselines/<NN-slug>.md`
(see existing baselines for naming and structure).

```markdown
# Calibration run: <scenario-slug>
Date: YYYY-MM-DD · Branch: calibration/<slug>

## Scenario
Link to scenarios/*.md

## Setup variations tested
- Baseline (defaults)
- + <coefficient tweak> — rationale

## Results vs expected
| Checkpoint | Expected | Actual | Pass/Fail |
| --- | --- | --- | --- |
|  |  |  |  |

## Mismatches & hypotheses
...

## Recommended coefficient changes
...

## Confidence
...
```

---
title: Verification
description: Mechanics are built first and tuned last; the scenario runner judges whole tanks, and tests pin formulas and invariants.
---

## Build first, tune last

A mechanic is done when it works and moves the right stock in the right
direction. Tuning its constants to real-tank numbers comes after the mechanics
around it exist, because every new mechanic shifts the chemistry the old ones
were tuned against.

## Whole tanks: the scenario runner

Whole-tank behaviour is judged by running the preset tanks headless — nano,
low-tech, high-tech, community, low-flow and cold — on a keeper's schedule,
sampled at fixed days and always on the last one. Each reading is graded
against a plausibility band:

| Grade | Meaning |
|---|---|
| Green | Inside what a real tank of that kind shows |
| Amber | Unusual but possible — worth a look |
| Red | Not something a real tank does |

The keeper keeps a planted tank the way a hobbyist does: once a week every plant
past 85 % of its unit is cut back to it, and the youngest are pulled until the
planting fits its floor again. Two readings watch the planting as a whole — floor cover
and floor shade ([Plants](/subsystems/plants/#crowding-and-carrying-capacity)) —
so an untrimmed tank's overgrowth reads as a floor planted past full and a
canopy darkening what grows under it.

Per-action flags replay a tank under a different keeper: more food, no water
changes, extra fish. A run saved as a baseline can be diffed against a later
one, so a change shows as the few readings it moved. Amber and red are
questions to reason about, not failures to fix — a constant is never moved
during build-out just to turn a cell green.

## Tests: formulas and invariants

The test suite pins what holds regardless of tuning:

| Kind | Example |
|---|---|
| Formula | A function computes what it says |
| Scaling | Doubling capacity doubles flow |
| Conservation | Nitrogen mass survives NH₃ → NO₂ → NO₃ |
| Soundness | No reading goes NaN or infinite |
| Determinism | The same seed runs the same life |

A test never pins a whole-tank outcome or a coefficient's value; those move
every time a mechanic lands.

## Source

The scenario runner and its bands live under `src/cli/scenarios/`, the invariant
tests under `src/simulation/tests/`, and the constants under
`src/simulation/config/`.

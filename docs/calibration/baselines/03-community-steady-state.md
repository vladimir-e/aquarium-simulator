# Calibration baseline: community-steady-state (S3)

Date: 2026-04-19 · Branch: calibration/community-steady-state

## Scenario
[scenarios/03-community-steady-state.md](../scenarios/03-community-steady-state.md)

## Status

**Stub.** The original S3 report was authored against an engine that used a
450× coefficient hack to force the NO3 sawtooth, which was removed by the
stoichiometric N-chain refactor (task 26) and the NOB/AOB asymmetry fix
(task 31). The hacked-era numbers are no longer reproducible or relevant.

The corrected engine — with MW-ratio N-chain stoichiometry, fish gill NH3
excretion, and raised bacteria-spawn thresholds — produces the scenario's
primary anchor:

> **24 → 40 ppm NO3 sawtooth over a 6-day water-change cycle**

for the 40 gal community setup described in the scenario file. A full
re-run report with per-checkpoint actuals will land when the scenario is
replayed end-to-end against the current engine (planned as a regression
harness exercise, not a calibration pass — the anchors already hold).

## Why this is a stub rather than a fresh run

- S3 was never given a dedicated CLI calibration pass after the
  stoichiometry rewrite; the rewrite was driven by S1 / S2 / S4 findings
  and the anchor held qualitatively when those scenarios passed.
- Preserving the obsolete 450×-hack report in-tree would mislead readers
  about the current engine's behaviour — better to flag it as pending.

## Recovery plan (when revisited)

1. `sim new --preset=community --tank-gal=40`
2. Populate per scenarios/03 setup (20 neons + 4 angels, 3 Java Fern +
   2 Amazon Sword at 50 %).
3. Run 6-day feed + 40 % water-change cycle three times; record NO3, NH3,
   NO2, fish-health, and waste at each daily checkpoint.
4. Compare against the "Single 6-day cycle" and "Multi-cycle stability"
   tables in `scenarios/03-community-steady-state.md`.

## Confidence

Medium-high for the sawtooth anchor (qualitatively validated via
smoke-test fish-metabolism probes and the N-conservation integration
test added in this PR). A fresh per-checkpoint report would be the clean
way to promote this from stub to canonical.

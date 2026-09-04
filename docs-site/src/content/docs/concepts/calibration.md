---
title: Calibration
description: Unit tests pin mechanism, anchors pin real-tank outcome — and a constant is a claim about aquariums, not a knob for turning a test green.
---

## Two kinds of test

The suite holds two things that look alike and are not equal.

| | Unit test | Calibration anchor |
|---|---|---|
| Pins | Mechanism | Outcome — how a tank behaves over weeks |
| Encodes | What the engine does | What a real aquarium does |
| Belongs to | The code it describes; edit it freely alongside | The reality it describes |
| Goes red when | The mechanism changed | The tank stopped behaving like a tank |

A feature may not edit an anchor band to go green. If a feature breaks an anchor,
either the feature is wrong or the constants need re-deriving — the anchor holds.
That asymmetry is the only thing standing between a plausible local change and a
silent global one.

Prefer invariants to magic numbers either way. Asserting that a flow equals 160
is a tripwire on a coefficient; asserting that doubling capacity doubles flow is
a statement about the model, and it survives recalibration.

## Constants are claims

A value in the engine's config is a claim about how real aquariums behave. It is
not a free parameter, and editing one changes the simulation everywhere at once,
silently — while the failing test was the only thing that noticed.

A constant is also only as good as the reference it names. When work invalidates
that reference, the constant is broken rather than awaiting calibration.

## When a test fails

The default assumption is that the code is wrong, not the number.

| | |
|---|---|
| 1 | Work out *why* it fails, and name the mechanism |
| 2 | If the mechanism is wrong, fix the mechanism |
| 3 | If the constant genuinely has to move, say it out loud: the old value, the new one, the real behaviour that justifies it, and what else it touches |
| 4 | If you can't tell, stop and raise it — an unresolved question beats a quietly tuned constant |

Never widen a tolerance, delete an assertion, or scale a coefficient to make a
scenario pass. Watch for the subtle version of the same move: a fixture
conditioned rather than a band widened passes by changing the tank instead of the
claim.

## The instrument can be wrong

A measurement instrument is a thing that can be wrong. The runner that samples a
tank on a schedule and the probes that reduce a month into a curve are code, and
a defect in either produces a number that looks exactly like evidence.

The failure to expect is not an inaccurate reading but an incomparable one. A gas
figure taken an hour out of phase with the process it measures is not a slightly
wrong version of the right number; it is a different quantity wearing the same
units.

Anchors and run reports come off the same runner on purpose. A figure quoted in a
report and a figure asserted in a test are then one measurement on one schedule,
so a report cannot flatter a mechanism the suite would fail.

## Reading red

A test's tier comes from its fixture, not its topic — a tank with fish in it is
livestock-tier however much the test is about the cycle. Below the tier being
changed, green is required. Above it red is expected, and reconciling it is the
closing task rather than a mid-change signal.

A neighbour's red is not a verdict on the change. A silenced tier is red-listed
with a reason and a return point, never quietly skipped.

## Evidence stays in the tree

A measurement is only evidence if it is still there to read. Run reports are
committed under `docs/calibration/runs/` alongside the probe that produced them:
the script is the ephemeral half, the report is not.

The scenarios and baselines kept next to those runs describe an earlier engine.
They are preserved as intent rather than as current behaviour, and reading them
as the latter is the standard way to be misled.

## Source

`docs/calibration/` holds the committed evidence. The runner and the probe
scripts live under `src/simulation/tests/`, the constants they judge under
`src/simulation/config/`, and the stateful driver a person steers a tank with
under `src/cli/`.

## Project Overview

Building a comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment.

## Documentation-Driven Development

This project follows documentation-driven development:
1. **Docs describe the system as it is** - the portal covers the whole system in present tense
2. **Code is iterative** - Implementation happens in scoped tasks, each with a clearly defined brief
3. **Keep docs current** - If you find inconsistencies or conflicts between the docs and your task, flag them! Update docs when implementation reveals better approaches

### Understanding the Project

1. **Start here:** Documentation lives in `docs-site/src/content/docs/` and is published at docs.fishroom.app — read the Overview for the architecture and how the pages are organised
2. **Check what to trust:** Each subsystem page carries a Status table — settled vs scaffolding vs missing. Read it before building on, defending, or "fixing" that system
3. **Check progress:** Read `CHANGELOG.md` to see what's implemented
4. **Task briefs** come from the maintainer/orchestrator per task; `docs/tasks/` holds earlier briefs as historical reference only

## Principles

**Project priorities:**
- Accurate simulation - the physics and biology should be realistic
- Clean, extensible architecture - elegant solutions over immediate wins

**No backward compatibility:**
- When removing code, clean it up completely as if it never existed
- No deprecated functions, no compatibility shims, no "kept for backward compatibility" comments

## Constants are not adjustable to make tests pass

When a test fails, the default assumption is that the **code** is wrong, not the number.

A value in `src/simulation/config/*` is a claim about how real aquariums behave. Editing one to turn a test green changes the simulation everywhere, silently — and the failing test was the only thing that noticed.

**Before changing any value in `src/simulation/config/`:**

1. Work out *why* the test fails, and name the mechanism.
2. If the mechanism is wrong, fix the mechanism.
3. If the constant genuinely needs to move — you changed the model and the old value no longer describes it — say so explicitly in the PR: the old value, the new one, the real-world behaviour that justifies it, and what else it affects.
4. If you can't tell, **stop and raise it**. An unresolved question is a better outcome than a quietly tuned constant.

Never widen a tolerance, delete an assertion, or scale a coefficient "to make the scenario pass." If a test is genuinely wrong, fix the test as its own change, and say why.

**This is not hypothetical.** `ambientWaste` was cut 10× because it dominated the nitrogen budget in one 38 L planted scenario. The scenario passed. Because the constant was a flat g/hr while the AOB spawn threshold is a *concentration*, that same edit pushed a 150 L tank's cycling from ~3 weeks to 51 days, and nothing caught it for months. The real defect was that ambient ammonia wasn't sourced from anything physical.

Two kinds of test live in this repo, and they are not equal:

- **Unit tests** pin mechanism. Edit them freely alongside the code they describe.
- **Calibration anchors** pin outcome — how a tank behaves over weeks. They encode real aquarium behaviour, not engine behaviour. **A feature PR may not edit an anchor band to go green.** If a feature breaks an anchor, either the feature is wrong or the constants need re-deriving; the anchor holds.

Prefer invariants over magic numbers when writing tests. `expect(flow).toBe(160)` is a tripwire on a coefficient; "doubling capacity doubles flow" is a statement about the model, and it survives recalibration.

**Tiers are decided by a test's fixture, not its topic** — a tank with fish in it is livestock-tier however much the test is about the cycle. Below your module's tier must stay green; above it, red is expected and reconciling is the module's closing task, never a mid-change signal — a neighbour's red is not a verdict on your change. A silenced tier is red-listed with a reason and a return point, never skipped.

Three more traps, all real: **a constant is only as good as the reference its docstring names** — when work invalidates the reference, the constant is broken, not awaiting calibration. **A measurement instrument is a thing that can be wrong** — a gas reader once classified hours one tick out of phase and nearly moved a yield constant on a statistic that was never comparable. **Watch for a fixture conditioned rather than a band widened** — a feature PR may not widen an anchor, and the subtle version passes by changing the tank instead.

## Quick Start for AI Agents

- Do not amend or force push commits, prioritize data safety
- Use git commands from the working directory and avoid the `git -C` argument — it causes unnecessary permission requests

**Task workflow:**

Task briefs are provided by the maintainer or orchestrator per task — there's no task file to open or update. (`docs/tasks/` holds the briefs from earlier development and is historical reference only; new work is not tracked there.) For each task:

1. Create a new branch
2. Implement the task
3. Create unit tests, aim for 90% coverage
4. Run `npm run lint` and fix any issues
5. Run all unit tests and build to validate your work
6. Update the docs pages your change touched — a behaviour change lands in the matching subsystem or concept page
7. Add an entry to `CHANGELOG.md`
8. Commit with a short message and raise a PR

**Docs discipline:**

- A page describes how the system works, in present tense, for a human reader — not a changelog, not a statement of intent
- Tables over prose wherever the content is a set of values, statuses or seams
- Source pointers name directories only, never filenames or signatures
- Docs change when behaviour changes, not when code gets refactored
- Never mention downstream consumers of the engine

## Gotchas

- **Ids are tank-unique, not process-unique** — two tanks emit the same id sequence, so UI state keyed by organism id must reset when the tank is replaced (`useExpandedRows` is the pattern). A tank's UI identity is `tankId`; seeds are nameable and two tanks can share one.
- **Three config writers, two sets of bounds** — CLI `applyConfigSet` and the debug panel both validate against `configRange(path)` off each tunable's `*ConfigMeta`; the persistence schema carries its own hand-written zod bounds. Widening a range means touching both sides, or a value the CLI accepts is one the save schema rejects, and a rejected config section reloads as defaults.
- **A range is enforced only where it's declared** — every tunable declares a min/max except the nitrogen cycle's, where only the two oxygen half-saturation constants do; the rest come off doubling times and were never bounded, so `config set` has nothing to hold them to. A test walks every leaf and pins exactly that split — deriving a bound turns it red on purpose.
- **Measured evidence is committed under `docs/calibration/runs/` with its probe** — a measurement is only evidence if it's still there to read. `baselines/` and `scenarios/` are pre-vitality, historical intent only.
- **Releasing is automated** — bump version + GitHub Release → Actions publishes with provenance. `aquarium-simulator@0.1.x`, MIT, engine-only dist, sole runtime dep immer.

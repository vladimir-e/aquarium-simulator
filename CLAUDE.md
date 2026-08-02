## Project Overview

Building a comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment.

## Spec-Driven Development

This project follows spec-driven development:
1. **Documentation is complete** - Full specs live in `docs/`
2. **Code is iterative** - Implementation happens in scoped tasks, each with a clearly defined brief
3. **Keep specs current** - If you find inconsistencies or conflicts between specs and your task, flag them! Update docs when implementation reveals better approaches

### Understanding the Project

1. **Start here:** Read `docs/1-DESIGN.md` for architecture and doc index
2. **Check progress:** Read `CHANGELOG.md` to see what's implemented
3. **Task briefs** come from the maintainer/orchestrator per task; `docs/tasks/` holds earlier briefs as historical reference only

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

## Quick Start for AI Agents

- Use subagents liberally to preserve main context window
- Run research agents instead of doing it in main context
- Give subagents same permissions as your own
- Do not amend or force push commits, prioritize data safety
- Use git commands from working directory and avoid `git -C` argument as it causes unnecessary permission requests. Instruct subagents about that as well.

**Task workflow:**

Task briefs are provided by the maintainer or orchestrator per task — there's no task file to open or update. (`docs/tasks/` holds the briefs from earlier development and is historical reference only; new work is not tracked there.) For each task:

1. Create a new branch
2. Implement the task
3. Create unit tests, aim for 90% coverage
4. Run `npm run lint` and fix any issues
5. Run all unit tests and build to validate your work
6. Add an entry to `CHANGELOG.md`
7. Commit with a short message and raise a PR

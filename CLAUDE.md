## Project Overview

Building a comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment.

## Documentation-Driven Development

This project follows documentation-driven development:
1. **Docs describe the system as it is** - the portal covers the whole system (rules in **Docs discipline** below)
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

## Build first, tune last

Build out mechanics first; tune last. The bar for a mechanic is that it works and moves the right stock in the right direction.

Whole-tank behaviour is checked with `npm run scenarios` — every preset tank headless for 90 days (`--days=300` for longer), each reading banded green/amber/red. Per-action flags (`--feed=2g/1d`, `--water-change=off`, …) replay a tank under a different keeper; usage in `docs/cli.md`. Amber or red is a question to reason about. Never tune a constant during build-out just to turn a cell green, and never add complexity to hit a number.

Tests pin formulas and invariants, never whole-tank outcomes or coefficient values. `expect(flow).toBe(160)` is a tripwire; "doubling capacity doubles flow" is a statement about the model. When a change breaks a test that pins a number rather than a behaviour, delete or rewrite it without ceremony.

Delete dead code and tests outright; never skip or disable.

Docs: a PR that changes a system rewrites that system's portal page (`docs-site/`), keeping it short — what it does and the concepts, for a human. Quirks go in code comments or this file.

## Quick Start for AI Agents

- Do not amend or force push commits, prioritize data safety
- Use git commands from the working directory and avoid the `git -C` argument — it causes unnecessary permission requests

**Task workflow:**

Task briefs are provided by the maintainer or orchestrator per task — there's no task file to open or update. For each task:

1. Create a new branch
2. Implement the task
3. Write tests for new formulas and invariants — no coverage target
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
- **Three config writers, two sets of bounds** — CLI `applyConfigSet` and the tunables drawer both validate against `configRange(path)` off each tunable's `*ConfigMeta`; the persistence schema carries its own hand-written zod bounds. Widening a range means touching both sides, or a value the CLI accepts is one the save schema rejects, and a rejected config section reloads as defaults.
- **A range is enforced only where it's declared** — every tunable declares a min/max except the nitrogen cycle's, where only the two oxygen half-saturation constants do; the rest come off doubling times and were never bounded, so `config set` and the drawer have nothing to hold them to. A test walks every leaf and pins exactly that split — deriving a bound turns it red on purpose.
- **Releasing is automated** — bump version + GitHub Release → Actions publishes with provenance. `aquarium-simulator@0.1.x`, MIT, engine-only dist, sole runtime dep immer.
- **Two Vercel projects deploy this repo** — the engine UI off the root `vercel.json`, the docs off `docs-site/vercel.json`. Without its own file the docs project inherits the root one and runs the UI build; both stay.

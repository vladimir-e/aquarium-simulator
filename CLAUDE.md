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

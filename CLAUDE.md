## Project Overview

Building a comprehensive aquarium ecosystem simulation engine that models all aspects of a fish tank environment.

## Spec-Driven Development

This project follows spec-driven development:
1. **Documentation is complete** - Full specs live in `docs/`
2. **Code is iterative** - Implementation happens via task files with clearly defined scope
3. **Keep specs current** - If you find inconsistencies or conflicts between specs and your task, flag them! Update docs when implementation reveals better approaches

### Understanding the Project

1. **Start here:** Read `docs/1-DESIGN.md` for architecture and doc index
2. **Check progress:** Read `CHANGELOG.md` to see what's implemented
3. **Task files** are stored in `docs/tasks/`

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
- Avoid using `git -C` flag, it causes unnecessary permission requests, including from subagents

**Task workflow:**
When working on a task `docs/tasks/XX-task-name.md`
1. Create a new branch
2. Implement the task
3. Create unit tests, aim for 90% coverage
4. Run `npm run lint` and fix any issues
5. Run all unit tests and build to validate your work
6. Add entry to `CHANGELOG.md`
7. Update task status in task file: `pending` → `completed`
8. Commit with short message and raise a PR
9. Post a comment '/review' on the PR, but ONLY when you push the first time though!

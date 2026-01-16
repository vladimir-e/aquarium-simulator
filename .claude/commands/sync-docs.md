---
description: Check if documentation needs updating to match implementation
---

Review documentation in @docs/ to check if implementation has revealed better approaches worth adopting in the spec.

**Important context:**
- Docs describe the COMPLETE system design (the target vision)
- Code is a PARTIAL implementation - unimplemented features are expected
- Docs are the source of truth for design; code catches up to them over time

**What to look for:**
- Implementation that works BETTER than the spec describes (update docs to match)
- Conflicts where implemented behavior contradicts the documented design
- Simulation components that exist in code but are NOT documented (add to specs)

**What NOT to do:**
- Never remove features from docs just because they're not implemented yet
- Never add implementation status or "not yet built" markers
- Never flag unimplemented features as discrepancies

**Process:**
1. Read the relevant documentation files
2. Review corresponding implementation in @src/simulation
3. Read test files (*.test.ts) to understand actual behavior - tests are always in sync with code
4. Only flag cases where implemented code reveals a different approach than documented
5. Propose doc updates that improve the design spec

$ARGUMENTS

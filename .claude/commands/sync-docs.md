---
description: Check if documentation needs updating to match implementation
---

Review the documentation in @docs-site/src/content/docs/ against the implementation and report where the two have drifted apart.

**Important context:**
- A page describes how the system works right now, in present tense, for a human reader
- Each subsystem page's Status table sorts its mechanics into settled / scaffolding / missing — that table is the honest state, not an aspiration
- A page that describes behaviour the code does not have is a defect in the page, not a target for the code

**What to look for:**
- Behaviour the code has that no page describes
- Pages describing behaviour the code no longer has, or never had
- Status rows naming a mechanic that has since been renamed or removed
- Constants and bands quoted on a page that no longer match `src/simulation/config/`

**What NOT to do:**
- Never add roadmap items, "not yet built" markers or planned features — absence goes in a Status row badged `missing`, or nowhere
- Never point at a filename or a signature; source pointers name directories
- Never mention downstream consumers of the engine

**Process:**
1. Read the relevant pages
2. Review the corresponding implementation in @src/simulation
3. Read test files (*.test.ts) to understand actual behavior - tests are always in sync with code
4. Flag each drift with the page, the claim, and what the code actually does
5. Propose the page edits that close it

$ARGUMENTS

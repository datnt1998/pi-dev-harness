---
description: Scan the codebase for deepening opportunities, report candidates, then grill the one you pick
argument-hint: "[module|subsystem|pain-point]"
---

Load `/skill:codebase-design` and follow its `ARCHITECTURE-REVIEW.md` reference.

Scope: ${1:-infer hot spots from recent git history (YAGNI: weight what keeps changing); ask only if the direction is genuinely ambiguous}

Discipline:

- Use the deep-module vocabulary exactly (module, interface, depth, seam, adapter, leverage, locality) and `CONTEXT.md` domain terms for module names. Respect ADRs in the area — flag a candidate that reopens one only when the friction warrants it.
- Apply the deletion test to anything suspected shallow.
- Present candidates as a report written to the OS temp dir (never in the repo): Files / Problem / Solution / Benefits / Before-After / strength badge (`Strong` | `Worth exploring` | `Speculative`), plus a Top recommendation. Do NOT propose concrete interfaces yet — ask which to explore.
- Once picked, grill the decision tree and keep the domain model current inline (`/skill:domain-modeling`); use `DESIGN-IT-TWICE.md` for alternative interfaces.

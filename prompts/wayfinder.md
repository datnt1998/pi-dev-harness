---
description: Chart or work a wayfinder map for a huge, foggy effort (plan via decision tickets)
argument-hint: "<loose idea | .scratch/<effort>/map.md [ticket]>"
---

Use `/skill:wayfinder`.

Input: $ARGUMENTS

Mode selection:
- If the input is a path to an existing `map.md` (optionally followed by a ticket name/id) → **Work through the map**: claim one frontier decision ticket, resolve it with the tool its type names, record the Answer, graduate fog. Resolve one HITL ticket this session.
- Otherwise treat the input as a loose idea → **Chart the map**: name the destination via `/grill-with-docs`, map the frontier breadth-first, create `.scratch/<effort>/map.md` + initial decision tickets with blocking edges. Claim newly created AFK research tickets before launching them through `researcher`; do not also resolve HITL tickets.
- No input → list existing maps under `.scratch/*/map.md` with status and frontier size, and ask which to work.

Remember: decisions, not deliverables. When the map is done, propose `/to-spec` → `/to-tickets` → `/prepare-tickets` → `/implement-all`.

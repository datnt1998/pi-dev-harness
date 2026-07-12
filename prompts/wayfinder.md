---
description: Chart or work a wayfinder map for a huge, foggy effort (plan via investigation tickets)
argument-hint: "<loose idea | .scratch/<effort>/map.md [ticket]>"
---

Use `/skill:wayfinder`.

Input: $ARGUMENTS

Mode selection:
- If the input is a path to an existing `map.md` (optionally followed by a ticket name/id) → **Work through the map**: claim one frontier ticket, resolve it with the tool its type names, record the Answer, graduate fog. Never resolve more than one ticket this session.
- Otherwise treat the input as a loose idea → **Chart the map**: name the destination via `/grill-with-docs`, map the frontier breadth-first, create `.scratch/<effort>/map.md` + initial tickets with blocking edges. Do not also resolve tickets.
- No input → list existing maps under `.scratch/*/map.md` with status and frontier size, and ask which to work.

Remember: decisions, not deliverables. When the map is done, propose `/to-spec` → `/to-tickets` → `/prepare-tickets` → `/implement-all`.

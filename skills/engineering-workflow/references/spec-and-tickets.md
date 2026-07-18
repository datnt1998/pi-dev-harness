# Spec and Tickets

Use this reference for `to-spec` and `to-tickets` phases.

## To Spec

Turn the current conversation, docs, and known constraints into a concrete spec.

Default path:

```txt
docs/specs/<slug>.md
```

Spec structure:

```markdown
# <Feature / Change>

## Goal

## Non-goals

## Context

## Requirements

## Acceptance Criteria

## Design Notes

## Risks / Edge Cases

## Validation Plan

## Open Questions
```

Rules:

- Do not invent requirements silently.
- Mark unknowns explicitly.
- Keep acceptance criteria testable.
- Include affected modules/files when known.
- If the spec is based on conversation only, say so.

## To Tickets

Break a spec or plan into small tracer-bullet tickets.

Default path:

```txt
.scratch/<slug>/tickets.md
```

Ticket structure:

```markdown
## T1 — <title>

Goal:

Scope:

Working directory: (recommended for monorepos)

Blocking edges:

Implementation notes:

Validation:

Done when:
```

Tracer-bullet rules:

- Each ticket should produce an end-to-end observable slice.
- Prefer small vertical slices over horizontal layers.
- Each ticket should be independently reviewable.
- In monorepos, name the workspace/working directory and use its focused validation; add root-wide checks only when repository policy requires them.
- Make dependencies explicit.
- Avoid mega tickets like "build backend".

## Issue Tracker

If `docs/agents/issue-tracker.md` exists, follow it. Otherwise use local markdown under `.scratch/`. During setup, add `.scratch/` to the project ignore policy unless the team intentionally versions workflow artifacts.

## Handoff

After creating spec/tickets, summarize:

- artifact paths
- recommended implementation order
- first ticket to start
- risks needing user confirmation

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

- Synthesize the current conversation and repository evidence; broad interviewing belongs in `grill-with-docs`.
- Mark unknowns explicitly under `Open Questions` instead of inventing requirements.
- Ask only when writing the spec would require an unapproved decision or a newly proposed test seam needs confirmation.
- Keep acceptance criteria testable.
- Include affected modules/files when known.
- If the spec is based on conversation only, say so.

## To Tickets

Break a spec or plan into small tracer-bullet tickets.

Default path:

```txt
.scratch/<slug>/tickets.md
```

Ticket structure (the deterministic readiness gate is authoritative):

```markdown
## T1 — <title>

Goal:
Scope:
Working directory: (optional for single-root; recommended for monorepos)
Non-goals: (optional)
Dependencies: none | T2, T3
Acceptance criteria:
- <testable observable outcome>
Validation:
- <repository-native command or manual flow>
Risks: (optional)
Done when:
- <completion criterion>
```

Tracer-bullet rules:

- Each ticket should produce an end-to-end observable slice.
- Prefer small vertical slices over horizontal layers.
- Each ticket should be independently reviewable.
- In monorepos, name the workspace/working directory and use its focused validation; add root-wide checks only when repository policy requires them.
- Make dependencies explicit.
- Avoid mega tickets like "build backend".

### Wide-refactor branch

A **wide refactor** is one mechanical change whose blast radius spans many callers, so no ordinary vertical slice can stay green. Use **expand-contract** instead:

1. **Expand** — add the new form beside the old without breaking callers.
2. **Migrate** — move callers in bounded batches sized by blast radius; each batch depends on the expand ticket.
3. **Contract** — remove the old form only after every migration ticket completes.

When migration batches cannot stay green independently, use an integration branch and make them all block one final integrate-and-verify ticket. Do not force a wide refactor into fake tracer bullets.

## Issue Tracker

If `docs/agents/issue-tracker.md` exists, follow it. Otherwise use local markdown under `.scratch/`. During setup, add `.scratch/` to the project ignore policy unless the team intentionally versions workflow artifacts.

## Handoff

After creating spec/tickets, summarize:

- artifact paths
- recommended implementation order
- first ticket to start
- risks needing user confirmation

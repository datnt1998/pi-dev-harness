---
name: domain-modeling
description: "Build and sharpen a project's domain model. Use when the user wants to pin down domain terminology or a ubiquitous language, record an architectural decision as an ADR, or when another skill (grill-with-docs, to-spec) needs to maintain CONTEXT.md and the domain model."
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill — that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

Adapted for Pi from mattpocock/skills (MIT). Pairs with `/grill-with-docs` (which drives this discipline) and `/to-spec`.

## File structure

Before creating or updating Markdown, follow
`../engineering-workflow/references/scratch-organization.md`: resolve the repository-
declared glossary and ADR authorities, protected/read-only paths, owner, consumer,
and lifecycle. The paths below are fallbacks only when the repository has no declared
convention.

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts; the map points to where each `CONTEXT.md` lives (see `CONTEXT-FORMAT.md`).

Create files lazily—only for a named future consumer and after the creation gate.
If no repository-declared glossary exists, fall back to `CONTEXT.md` when the first
term is resolved. If no repository-declared ADR authority exists, fall back to
`docs/adr/` when the first qualifying ADR is needed. Never mutate signed or read-only
authorities; escalate instead.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update the glossary authority inline

When a term is resolved, update the repository-declared glossary right there. Don't
batch these up—capture them as they happen. Use `CONTEXT-FORMAT.md` when the authority
is a `CONTEXT.md` file.

A `CONTEXT.md` glossary should be totally devoid of implementation details. Do not
treat it as a spec, scratch pad, or repository for implementation decisions.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in `ADR-FORMAT.md` (same directory).

# Grill With Docs

Use this phase when the desired change is unclear, broad, high-risk, or domain-language-heavy.

## Goals

- Reach shared understanding before implementation.
- Convert fuzzy intent into concrete human decisions.
- Build shared language that reduces future verbosity.
- Capture important decisions as ADRs.

## Process

1. State the current understanding in 3-5 bullets.
2. **Grill one decision at a time.** Walk the decision tree in dependency order and wait for the user's answer before continuing.
3. Look up repository/environment **facts** instead of asking the user. Put every unresolved product, scope, API, architecture, or data **decision** to the user with a recommended default.
4. Update the shared domain model as terms and durable decisions crystallise.
5. Summarize the resolved model and ask the user to confirm shared understanding.
6. Proceed to docs or the next delivery phase only after that confirmation. Draft substantial doc writes for approval when they fall outside the already approved scope.

## Before Locking a Direction

Scope these gates to direction-setting decisions, not every clarification:

- Explicitly challenge at least one core assumption of the requested approach.
- Surface 2-3 genuinely different alternatives — different mechanisms, not variations of one idea — each with concrete trade-offs.
- Name the simplest viable option that still meets the requirements, even when not chosen.
- State second-order effects of the chosen direction ("and then what?").
- Record the decision through the repository ADR authority via `/skill:domain-modeling` when it is architecture-shaping.

`spec-and-tickets.md` applies the same gates when a spec/ticket set locks a direction that was not already resolved here.

## Question Areas

- Goal and user outcome.
- Non-goals and explicit exclusions.
- Domain terms and names.
- Data model and lifecycle.
- Edge cases and failure modes.
- UX/API expectations.
- Compatibility/migration concerns.
- Validation and acceptance criteria.

## Domain Docs

Resolve the repository-declared glossary and repository-declared ADR authority first,
including protected or read-only paths. When no convention exists, use these fallback
artifacts:

```txt
CONTEXT.md
docs/adr/0001-short-title.md
```

A fallback `CONTEXT.md` should contain:

- Glossary of project terms.
- Important domain concepts.
- Common flows/lifecycles.
- Naming rules and examples.

ADR should contain:

- Status.
- Context.
- Decision.
- Consequences.
- Alternatives considered.

## Output

End with:

- resolved decisions
- remaining open questions
- proposed next phase (`to-spec`, `to-tickets`, or `implement`)

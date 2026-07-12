# Grill With Docs

Use this phase when the desired change is unclear, broad, high-risk, or domain-language-heavy.

## Goals

- Align with the user before implementation.
- Convert fuzzy intent into concrete decisions.
- Build shared language that reduces future verbosity.
- Capture important decisions as ADRs.

## Process

1. State the current understanding in 3-5 bullets.
2. Ask focused questions one section at a time.
3. Prefer recommended defaults so the user can answer quickly.
4. Stop grilling when the remaining ambiguity no longer blocks safe progress.
5. Draft doc changes and ask before writing if they are substantial.

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

Default artifacts:

```txt
CONTEXT.md
docs/adr/0001-short-title.md
```

`CONTEXT.md` should contain:

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

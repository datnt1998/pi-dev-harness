# Two-Axis Code Review

Use this reference when reviewing a branch, PR, WIP diff, or completed implementation.

## Fixed Point

Ask for a fixed point if missing:

- commit SHA
- branch name
- tag
- `main`
- `HEAD~N`

Use three-dot diff when comparing branch work:

```bash
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

If not in a git repo, review changed files the user identifies.

## Axis 1 — Standards

Review against:

- `AGENTS.md`
- `CONTRIBUTING.md`
- `README.md`
- project coding standards
- existing code style
- smell baseline below

Smell baseline:

- Mysterious Name
- Duplicated Code
- Feature Envy
- Data Clumps
- Primitive Obsession
- Repeated Switches
- Shotgun Surgery
- Divergent Change
- Speculative Generality
- Message Chains
- Middle Man
- Refused Bequest

Treat smells as judgment calls, not hard failures, unless repo standards make them explicit.

## Axis 2 — Spec

Review against:

- issue
- spec file
- PRD
- user request
- acceptance criteria

Find:

- missing requirements
- partial implementation
- wrong behavior
- scope creep
- untested acceptance criteria

## Parallel Subagent Pattern

When `pi-subagents` is available, launch async fresh-context, review-only reviewers:

- reviewer 1: Standards axis
- reviewer 2: Spec axis, including acceptance criteria and validation evidence

Reviewers inspect the actual diff and source files, cite file/line evidence, and do not edit project files. Keep their reports and severity judgments separate; do not collapse or rerank findings across axes.

The parent then classifies findings as blockers, fixes worth doing now, optional/deferred improvements, or feedback to ignore. For implementation-authorized work, apply accepted fixes through one writer and re-run focused review when the fix is substantial. Stop for unapproved product, architecture, API, data, or scope decisions.

## Final Report

```markdown
## Standards
- ...

## Spec
- ...

## Summary
- Standards findings: N
- Spec findings: N
- Worst standards issue:
- Worst spec issue:
- Fixes worth doing now:
- Deferred or rejected feedback:
- Re-review required: yes/no
```

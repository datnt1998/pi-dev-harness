# Two-Axis Code Review

Use this reference when reviewing a branch, PR, WIP diff, or completed implementation.

## Fixed Point

Resolve the review surface in this order:

1. user-supplied commit/branch/tag/scope;
2. merge-base with the configured upstream or repository-documented default branch;
3. staged plus unstaged worktree diff (including relevant untracked files);
4. files explicitly identified by the user when Git evidence is unavailable.

Never assume the default branch is `main`. Use three-dot diff for branch comparison:

```bash
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

Report which surface was reviewed. If none can be established, report the evidence gap instead of claiming a complete review.

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

If `pi-subagents` is unavailable or its budget is exhausted, run the same two axes sequentially as an explicit structured self-review. Record that isolation was unavailable; do not skip review or claim independent review.

## Final Report

Preserve Standards and Spec findings separately. On pass, report one terse line. On findings, list only actionable items ordered by severity, evidence gaps, accepted/deferred fixes, and whether re-review is required. Map acceptance criteria through `completion-evidence.md`; never infer pass from missing evidence.

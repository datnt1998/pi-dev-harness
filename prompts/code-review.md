---
description: Two-axis review of a diff or implementation using falsification and adversarial authority
argument-hint: "[fixed-point-or-scope]"
---

Use `/skill:engineering-workflow` phase `code-review`.

Fixed point or scope: ${1:-ask me for the fixed point if needed}

Review along two axes:
1. Axis A — Falsification: attack the guards via named mutations.
2. Axis B — Adversarial authority: derive violating inputs/scenarios from governing clauses.

Use `testing-strategy.md` plus `diff-aware-testing.md` to verify that evidence covers application-owned behavior at the narrowest binding layer: repository-native static checks first, the smallest related behavioral guard next, broader integration/specialized checks only for a named reason, and a full suite only for a repository-required/requested/release gate. Require red→green evidence for behavior changes/bug fixes or an explicit not-applicable reason with alternative evidence; do not infer chronology from the final diff. Treat blind retries or weakened/skipped guards used to recover green as findings. Use async fresh-context, review-only subagents when useful. Keep both axis reports separate with file/line evidence, then classify findings into blockers, fixes worth doing now, optional/deferred items, and feedback to ignore. Do not edit unless the review scope explicitly authorizes a single fix writer.

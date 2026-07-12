---
description: Two-axis review of a diff or implementation using standards and spec
argument-hint: "[fixed-point-or-scope]"
---

Use `/skill:engineering-workflow` phase `code-review`.

Fixed point or scope: ${1:-ask me for the fixed point if needed}

Review along two axes:
1. Standards: repo conventions, maintainability, smell baseline.
2. Spec: whether the work implements the requested behavior.

Use async fresh-context, review-only subagents when useful. Keep Standards and Spec reports separate with file/line evidence, then classify findings into blockers, fixes worth doing now, optional/deferred items, and feedback to ignore. Do not edit unless the review scope explicitly authorizes a single fix writer.

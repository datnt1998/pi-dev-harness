---
description: Implement an approved spec/ticket in small tested slices
argument-hint: "<spec-or-ticket>"
---

Use `/skill:engineering-workflow` phase `implement` for:

$ARGUMENTS

Before editing, confirm the target, non-goals, test seams, and validation contract, then inspect relevant files. Keep one writer for the active worktree. Implement in small vertical slices, use TDD where feasible, and run focused checks. Treat a worker handoff as intermediate: run async fresh-context Standards and Spec/validation reviewers, synthesize their reports, apply accepted in-scope fixes with one writer, and re-review substantial fixes before the final summary. After review, use `/skill:git-rules` to prepare a commit-ready checkpoint with a proposed Conventional Commit message. Do not commit unless explicitly asked or confirmed.

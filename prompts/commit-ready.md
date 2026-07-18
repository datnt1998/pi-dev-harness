---
description: Inspect git state and prepare or create a standards-compliant commit
argument-hint: "[optional scope or commit instruction]"
---

Use `/skill:git-rules` for:

$ARGUMENTS

Inspect status and relevant diffs. Report one terse line: scope, checks/review, gaps/risks, proposed commit. If commit was explicitly authorized, stage exact intended paths and commit without asking again; otherwise ask once. Never infer push/release/deploy permission.

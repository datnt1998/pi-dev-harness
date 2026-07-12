---
description: Inspect git state and prepare or create a standards-compliant commit
argument-hint: "[optional scope or commit instruction]"
---

Use `/skill:git-rules` for:

$ARGUMENTS

Inspect `git status --short` and relevant diffs. Summarize changed files, checks already run, validation gaps, and propose a Conventional Commit message. If the user explicitly asked to commit, stage only intended files and commit; otherwise ask for confirmation before committing.

---
description: Autonomously implement all runnable tickets from a gated manifest or ticket file
argument-hint: "<manifest-or-tickets-path> [--commit]"
---

Run the autonomous ticket batch for:

$ARGUMENTS

Rules:
- If the path was not already gated, run `/skill:ticket-readiness` first; only READY/AUTO_FIXED tickets run.
- Use the `/implement-all` command to start the batch, then follow `/skill:batch-implementation`.
- The parent is the sole writer for the active batch worktree. For each ticket run implement → validate → async fresh-context reviewer → parent-synthesized scoped fix; do not launch a writer subagent into that worktree.
- Escalate only unapproved product/architecture/scope decisions, destructive/credential/production actions, or spec contradictions.
- Do not commit unless `--commit` is given; then commit one Conventional Commit per validated ticket via `/skill:git-rules` with precise staging.
- End with `/implementation-status` and an evidence-based summary.

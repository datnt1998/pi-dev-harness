---
description: Run a subagent-assisted review of the Pi harness and engineering workflow setup
argument-hint: "[focus]"
---

Review the Pi harness and engineering workflow setup with subagents.

Focus: ${1:-reuse, correctness, safety, and completeness}

Suggested delegation:
- Keep the parent as orchestrator and launch read-only agents asynchronously.
- Use fresh-context `scout` to inspect AGENTS.md and `.pi` resources.
- Use fresh-context `reviewer` passes for workflow correctness, safety/conflicts, and validation; preserve their evidence separately.
- Use forked advisory `oracle` only for risky package or architecture decisions that depend on inherited session context.
- Do not launch writers during the audit.

Synthesize the findings into blockers, fixes worth doing now, and deferred improvements.

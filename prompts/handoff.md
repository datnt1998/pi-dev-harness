---
description: Create a durable continuation artifact with validation evidence for another session or agent
argument-hint: "[task]"
---

Use `/skill:engineering-workflow` phase `handoff`.

Task: $ARGUMENTS

Create the handoff defined by `references/handoff.md`, `references/scratch-organization.md`, and `references/completion-evidence.md`: goal, status, files, decisions, acceptance evidence, checks, risks, unverified areas, next steps, useful commands. Default to chat; if a named later consumer needs a file, replace `.scratch/<effort>/handoff.md` rather than creating another dated/session/agent copy. Run scratch close-out first. Compact but specific.

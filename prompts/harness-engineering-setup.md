---
description: Audit and complete a reusable Pi harness plus engineering workflow stack
argument-hint: "[scope]"
---

Use `/skill:pi-harness` and `/skill:engineering-workflow` together to audit and complete the Pi agent stack for:

${1:-this project}

Check and report:
- Pi resources: AGENTS.md, APPEND_SYSTEM, settings, skills, prompts, extensions, themes
- Engineering workflow: grill-with-docs, to-spec, to-tickets, implement, code-review, diagnose, handoff
- Package stack: pi-subagents, pi-web-access, optional pi-hypa
- Subagent model routing and cost profile
- Tool/package conflicts
- TUI critical visibility and cleanup

If changes are needed, propose the architecture and ask before large edits.

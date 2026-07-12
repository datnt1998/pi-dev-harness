---
description: Audit the current Pi harness for reuse, safety, drift, and completeness
argument-hint: "[focus]"
---

Use `/skill:pi-harness` to audit this Pi harness.

Focus: ${1:-reuse, safety, drift, and completeness}

Check:
- Naming: reusable vs project-specific
- AGENTS.md and APPEND_SYSTEM.md size/scope
- Skills and prompt trigger quality
- Extension lifecycle cleanup
- Tool/package conflicts
- TUI responsiveness and critical info visibility
- Missing package/tool layer

Return prioritized fixes.

# Pi Orchestrator Skill Template

Use this template when creating a top-level orchestrator skill.

```markdown
---
name: <generic-name>
description: <What this orchestrates and exactly when to use it. Include trigger phrases.>
---

# <Harness/Workflow Name>

## Purpose

Explain what this orchestrates and the expected final output.

## Entry Conditions

Use this workflow when:
- ...

Do not use it when:
- ...

## Inputs

Ask for missing required inputs only when they block progress.

- Goal:
- Scope:
- Constraints:
- Output format:

## Architecture Pattern

Selected pattern: Pipeline | Fan-out/Fan-in | Expert Pool | Producer-Reviewer | Supervisor | Hierarchical Delegation

Why this pattern fits:
- ...

## Workflow

### Phase 0 — Audit
- Inspect existing files/resources.
- Detect duplication and drift.
- Report plan before large changes.

### Phase 1 — Analyze
- Understand domain/task.
- Identify risks and required tools.

### Phase 2 — Design
- Choose resources to create/update.
- Prefer reusable names.

### Phase 3 — Implement
- Make small reversible edits.
- Document commands/tools.

### Phase 4 — Validate
- Run lightweight checks.
- Verify `/reload` is needed and say so.

### Phase 5 — Handoff
- Summarize changed files and next steps.

## Artifacts

- `AGENTS.md`
- `.pi/APPEND_SYSTEM.md`
- `.pi/skills/...`
- `.pi/prompts/...`
- `.pi/extensions/...`
- `.pi/themes/...`

## Safety

- Do not run destructive commands without explicit approval.
- Preserve critical Pi UI context visibility.
- Avoid duplicate tool names.
```

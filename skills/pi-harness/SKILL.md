---
name: pi-harness
description: "Design, audit, extend, and validate reusable Pi agent harnesses. Use when building project-local or global Pi resources: AGENTS.md, APPEND_SYSTEM.md, .pi/skills, .pi/prompts, .pi/extensions, .pi/themes, commands, tools, TUI, and workflow guardrails."
---

# Pi Harness — Reusable Agent Harness Architect

Use this skill to design and evolve a **Pi-native agent harness**. A harness is a coordinated set of instructions, skills, prompts, extensions, themes, tools, and validation workflows that make Pi effective for a domain.

This skill ports the team-architecture mindset of meta-harness systems into Pi's runtime model. Keep the mindset; target Pi resources.

## Core Principles

1. **Pi-native output**
   - Generate and maintain `AGENTS.md`, `.pi/APPEND_SYSTEM.md`, `.pi/skills/`, `.pi/prompts/`, `.pi/extensions/`, `.pi/themes/`, and optional reusable packages.
   - Do not generate `.claude/*` unless the user explicitly asks for Claude Code compatibility.

2. **Architecture before files**
   - Analyze the domain, task types, risks, data flow, and user workflow before creating resources.
   - Pick an architecture pattern before implementation.

3. **Progressive disclosure**
   - Keep always-loaded instructions concise.
   - Put detailed workflows into skills and references loaded on demand.

4. **Orchestrator-first**
   - Define how tasks flow through roles, skills, prompts, tools, and validation.
   - In Pi, orchestration is implemented through skills, prompts, commands, and optional extensions rather than Claude Agent Teams APIs.

5. **Audit and evolve**
   - Harness resources should be reviewed for drift, duplication, stale commands, missing cleanup, and hidden critical UI data.

6. **Workflow-aware harnessing**
   - A harness should not only define resources; it should define how engineering work flows through alignment, specs, tickets, implementation, review, and handoff.
   - When the harness is for coding work, integrate or recommend `/skill:engineering-workflow` unless the project has an equivalent workflow layer.

## Phase 0 — Existing Harness Audit

Before creating anything, inspect existing resources:

- `AGENTS.md`
- `.pi/APPEND_SYSTEM.md` / `.pi/SYSTEM.md`
- `.pi/settings.json`
- `.pi/skills/`
- `.pi/prompts/`
- `.pi/extensions/`
- `.pi/themes/`
- Package installs if visible through Pi/package config
- Engineering workflow layer: `/skill:engineering-workflow`, `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`, `/code-review`, `/diagnose`, `/handoff`
- Subagent layer: `pi-subagents` agents such as `scout`, `planner`, `worker`, `reviewer`, `oracle`, `researcher`

Classify the situation:

- **New harness**: few or no Pi resources exist.
- **Extension**: a harness exists and needs a new capability.
- **Maintenance**: fix drift, duplication, naming, safety, or UI regressions.
- **Packaging**: make resources reusable across projects.

Report the audit and ask for confirmation before large changes.

## Phase 1 — Domain Analysis

Identify:

- Primary domain and recurring workflows.
- Inputs/outputs the agent must handle.
- Required tools and external integrations.
- Risk areas: destructive shell, credentials, private URLs, production resources.
- User preference: terse vs explanatory, proactive vs conservative.
- Reuse target: project-local, global, or package-ready.

## Phase 2 — Architecture Pattern Selection

Choose one or combine patterns. Read `references/architecture-patterns.md` when pattern choice matters.

Common Pi mappings:

- **Pipeline** → prompt/skill sequence with checkpoints.
- **Fan-out/Fan-in** → multiple focused review prompts/skills, merged by orchestrator skill.
- **Expert Pool** → domain skills selected by descriptions.
- **Producer-Reviewer** → build prompt + review prompt/skill.
- **Supervisor** → orchestrator skill dispatches to available tools/skills.
- **Hierarchical Delegation** → layered skills and references; optionally external Pi sessions.

## Phase 3 — Resource Design

Map design to Pi resource types. Read `references/pi-resource-mapping.md` when unsure. For coding/engineering harnesses, also read `references/engineering-workflow-integration.md`.

Use:

- `AGENTS.md` for project conventions and stable guardrails.
- `.pi/APPEND_SYSTEM.md` for reusable behavior appended to Pi's default system prompt.
- `.pi/skills/<name>/SKILL.md` for on-demand domain workflows.
- `.pi/prompts/*.md` for slash-command prompt templates.
- `.pi/extensions/*.ts` for tools, commands, TUI, safety gates, providers, and event hooks.
- `.pi/themes/*.json` for visual polish.
- Pi packages when the harness should be reused across projects.

Naming rules:

- Avoid project-specific names for reusable components.
- Prefer generic names: `pi-harness`, `web-research`, `repo-audit`, `release-check`, `safe-ops`.
- Put project identity in `AGENTS.md`, not in reusable skill names.

## Phase 4 — Implementation

Implement small, reversible changes.

When editing Pi resources:

- Preserve built-in visibility: cwd/path, model, context usage, max context, context %, thinking level, token/cost data.
- Prefer responsive footer/status widgets and overlays for detail views.
- Add `session_shutdown` cleanup for custom UI/status/timers.
- Avoid duplicate tool names across extensions and packages.
- Document new commands and tools in `AGENTS.md`.

## Phase 5 — Validation

Read `references/validation-testing-guide.md` for deeper checks. If an engineering workflow layer is present, validate that its prompts and skill names are documented and reusable.

Minimum checks:

- Does `/reload` succeed?
- Do new commands appear in slash autocomplete?
- Are new skills triggerable through `/skill:<name>`?
- Do custom tools avoid name conflicts?
- Does UI remain readable on narrow terminals?
- Are destructive operations gated or documented?
- Are package-vs-local responsibilities clear?

## Phase 6 — Handoff

Summarize:

- Files changed.
- Commands/tools/skills added.
- How to reload/test.
- Any required environment variables or package installs.
- Next recommended capability.

## Reference Files

Load only as needed:

- `references/architecture-patterns.md` — team/harness design patterns.
- `references/pi-resource-mapping.md` — how to map concepts to Pi resources.
- `references/orchestrator-template.md` — reusable orchestrator skill template.
- `references/skill-writing-guide.md` — skill design and progressive disclosure.
- `references/extension-design-guide.md` — extension safety, TUI, and tool design.
- `references/validation-testing-guide.md` — validation and drift audit.
- `references/team-examples.md` — example reusable harness designs.
- `references/engineering-workflow-integration.md` — how Pi harness resources connect to real engineering workflows and subagents.

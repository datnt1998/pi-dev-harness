---
name: engineering-workflow
description: "Reusable real-engineering workflow for Pi: align with the user, build shared domain docs, turn discussion into specs/tickets, implement in small TDD slices, run two-axis subagent code review, and create handoff notes. Use when the user asks to build, plan, implement, review, debug, or hand off engineering work with disciplined process."
---

# Engineering Workflow

A Pi-native workflow for real engineering work: small, composable, evidence-driven, and user-controlled.

This skill is inspired by engineering skill-pack workflows, but targets Pi resources and `pi-subagents` rather than Claude-specific APIs.

When the work involves changing Pi resources (`AGENTS.md`, `.pi/APPEND_SYSTEM.md`, `.pi/skills`, `.pi/prompts`, `.pi/extensions`, `.pi/themes`, package configuration), coordinate with `/skill:pi-harness`. Read `references/pi-harness-integration.md` when that boundary matters.

## Core Mindset

1. **Alignment before action** — do not assume the user knows every edge case; interview when ambiguity matters.
2. **Shared language** — maintain concise domain vocabulary in `CONTEXT.md` and decisions in ADRs.
3. **Small feedback loops** — prefer tracer-bullet tickets, vertical slices, typecheck/test feedback, and red-green-refactor.
4. **Separate generation from review** — implementation and review should be separate phases; use subagents where useful.
5. **Commit-ready checkpoints** — after each successful implementation, use `/skill:git-rules` to inspect git state and propose a standards-compliant commit.
6. **Handoff as a first-class artifact** — long work should end with a compact continuation note.

## Invocation Modes

This skill supports these phases. The user may call a phase directly through prompt templates, or ask naturally.

- `grill-with-docs` — interview the user and update domain docs.
- `to-spec` — turn conversation/context into a concrete spec.
- `to-tickets` — split a spec/plan into small tracer-bullet tickets.
- `implement` — implement approved work in small tested slices.
- `code-review` — review changes along Standards and Spec axes, preferably with parallel subagents.
- `diagnose` — disciplined bug diagnosis loop.
- `handoff` — create continuation notes for another session/agent.

## Phase Router

When the user asks broadly, choose the first applicable phase:

1. Ambiguous goal or many unknowns → `grill-with-docs`.
2. Clear conversation but no written target → `to-spec`.
3. Spec/plan exists but work is large → `to-tickets`.
4. Approved ticket/spec exists → `implement`.
5. Code changed or PR/diff needs checking → `code-review`.
6. Bug/failure exists → `diagnose`.
7. Session needs transfer/summary → `handoff`.
8. The task is about Pi agent resources, packages, skills, prompts, extensions, themes, or harness architecture → use `/skill:pi-harness` first or alongside this workflow.
9. Design question that needs a runnable answer (state model, UI variations) → `/skill:prototype`.
10. Designing or restructuring a module's interface/seam → `/skill:codebase-design`.
11. Domain terms are fuzzy, overloaded, or a hard-to-reverse decision needs recording → `/skill:domain-modeling`.
12. Effort too big for one session, path still foggy (greenfield, oversized feature) → `/skill:wayfinder` — plan as a map of investigation tickets first; it merges back into this flow at `to-spec`. A practical tell: grilling keeps surfacing questions that each need their own session (≥3 times).

## Pi Harness Boundary

Use `/skill:pi-harness` when the engineering task changes the agent harness itself:

- adding/removing Pi packages
- creating reusable skills or prompt templates
- writing Pi extensions or custom tools
- changing TUI/footer/header/theme behavior
- auditing naming, package conflicts, or resource drift
- deciding whether a capability belongs in a skill, prompt, extension, theme, or package

Then return to this skill for normal engineering flow: spec, tickets, implementation, review, and handoff.

## Companion Skills

Vocabulary and detour skills that run underneath or beside the phases:

- `/skill:domain-modeling` — the active glossary/ADR discipline that `grill-with-docs` and `to-spec` drive; single source of truth for `CONTEXT.md` and ADR formats.
- `/skill:codebase-design` — deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for `implement`, `code-review`, and `diagnose` when architecture is the topic.
- `/skill:prototype` — throwaway logic/UI prototypes when a question can't be settled in conversation; detour from `grill-with-docs`, bridged by `handoff`.
- `/skill:wayfinder` — the planning layer above this flow for multi-session efforts: charts a map of grilling/prototype/research tickets under `.scratch/`, resolves one per session, then merges in at `to-spec`.
- `/skill:git-rules` — commit checkpoints and merge-conflict resolution.
- `/skill:react-best-practices` — React perf/architecture rules (waterfalls, bundle, re-renders, composition) for `implement` and `code-review` on frontend code; pairs with `/skill:make-interfaces-feel-better` via the `/fe-polish` prompt.

## Pi Subagent Orchestration Contract

The parent session owns scope, delegation, synthesis, and final acceptance. Children receive narrow role-specific tasks; they do not launch subagents or make unapproved product, architecture, API, data, or scope decisions. A blocked child escalates through the available supervisor/intercom bridge instead of guessing.

Use `pi-subagents` when it improves isolation or review quality:

- `scout` / `context-builder` — fresh-context repository reconnaissance and handoff material.
- `researcher` — fresh-context web/docs research with citations.
- `planner` — plan from approved context; fork only when inherited session decisions matter; no edits.
- `worker` — the sole writer for an approved implementation or fix pass; normally forked.
- `reviewer` — fresh-context, review-only independent checks.
- `oracle` — normally forked advisory review for risky decisions or context drift; no edits unless explicitly assigned as the sole writer.

Operational defaults:

- Call subagents asynchronously unless foreground interaction is intentionally required; keep doing independent parent work, then use `wait()` when the result is required.
- Keep one writer per active worktree. Parallelize reconnaissance, research, review, and validation—not ordinary writes. Use isolated worktrees only for intentionally parallel writers.
- Define a lightweight validation contract before a writer starts: expected behavior, acceptance checks, commands or user flows, and evidence required in the handoff.
- Treat a worker handoff as intermediate. Run fresh reviewers, preserve their separate evidence, synthesize accepted fixes, and use one fix writer when needed. Re-review substantial fixes.
- Omit `acceptance` to use package inference. To explicitly disable it, use `false` (or `{ level: "none", reason: "..." }`), not bare `"none"`. `reviewed` applies to a writer workflow requiring independent review, not to a review-only child.

For parallel review, prefer two focused fresh-context reviewers:

- Standards reviewer: coding standards, maintainability, smells, simplicity.
- Spec reviewer: requested behavior, acceptance criteria, tests, and validation evidence.

## Workflow Summaries

### Grill With Docs

Read `references/grill-with-docs.md` when requirements are ambiguous or domain language is unclear.

Output artifacts:
- `CONTEXT.md` for shared vocabulary and domain model.
- `docs/adr/NNNN-title.md` for important decisions.

### To Spec

Read `references/spec-and-tickets.md`.

Output artifacts:
- `docs/specs/<slug>.md` or user-selected path.
- Include goal, non-goals, requirements, acceptance criteria, risks, and validation plan.

### To Tickets

Read `references/spec-and-tickets.md`.

Output artifacts:
- `.scratch/<slug>/tickets.md` by default, unless the repo has an issue tracker convention.
- Tickets should be tracer bullets: small, end-to-end, independently verifiable.

### Implement

Read `references/implementation-tdd.md`.

Rules:
- Do not implement a large ambiguous plan without approval.
- Prefer small vertical slices.
- Run focused checks often; full suite at the end when feasible.
- After implementation, run `code-review` before final summary.
- After review, use `/skill:git-rules` to prepare a commit-ready checkpoint and propose a Conventional Commit message.

### Code Review

Read `references/code-review.md`.

Review axes:
- **Standards** — repo conventions, maintainability, smell baseline.
- **Spec** — requested behavior, missing requirements, scope creep.

Keep findings separated.

### Diagnose

Read `references/diagnosing-bugs.md`.

Loop:
- reproduce → minimise → hypothesise → instrument → fix → regression-test.

### Handoff

Read `references/handoff.md`.

Output a compact document with goal, state, decisions, files changed, tests, risks, and next steps.

## Safety

- Do not run destructive commands without explicit approval.
- Do not commit unless the user explicitly asks or confirms the commit-ready checkpoint.
- Preserve Pi critical UI/context visibility when changing harness resources.
- If using packages/extensions, avoid duplicate tool names.

## Integration References

Load only when needed:

- `references/pi-harness-integration.md` — boundary and handoff between engineering workflow and Pi harness work.
- `references/research.md` — source-backed research flow using `pi-web-access` and `researcher`.

## Done Criteria

For engineering tasks, final response should mention:

- What changed.
- What was validated.
- What remains risky or unverified.
- Suggested next action.

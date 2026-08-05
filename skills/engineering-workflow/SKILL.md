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
2. **Shared language** — maintain concise domain vocabulary and decisions in repository-declared glossary/ADR authorities; use `CONTEXT.md` and `docs/adr/` only as fallbacks.
3. **Small feedback loops** — prefer tracer-bullet tickets, vertical slices, typecheck/test feedback, and red-green-refactor.
4. **Separate generation from review** — implementation and review should be separate phases; use subagents where useful.
5. **Commit-ready checkpoints** — after each successful implementation, use `/skill:git-rules` to inspect git state and propose a standards-compliant commit.
6. **Handoff as a first-class artifact** — long work should end with a compact continuation note.
7. **Approve once, execute fully** — approved reversible scope runs through implementation, validation, review, fixes, and checkpoint without intermediate confirmation. Read `references/autonomous-execution.md` when execution authority matters.
8. **Every artifact has a lifecycle and canonical home** — default to chat; before creating a doc, name its consumer, artifact type, persistence tier, canonical path, owner, and deletion trigger. Cross-session working state uses one registered `.scratch/<effort>/` directory, never scattered files. Read `references/artifact-lifecycle.md` and `references/scratch-organization.md`; use `/skill:repo-hygiene` for enforcement and sweeps.

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

When the user asks broadly, route specific on-ramps before the generic delivery flow:

1. Bug, regression, flake, or performance failure → `diagnose`.
2. Huge, foggy, multi-session effort → `/skill:wayfinder`; merge back at `to-spec` when the decision map is clear.
3. Design uncertainty that needs a runnable answer (state/logic or UI) → `/skill:prototype`.
4. Interface or seam design → `/skill:codebase-design`; an active scan for deepening opportunities → `/improve-architecture`.
5. Fuzzy/overloaded domain terms or an ADR-worthy decision → `/skill:domain-modeling`.
6. Pi resources, packages, skills, prompts, extensions, themes, or harness architecture → `/skill:pi-harness` first or alongside this workflow.
7. Repository-doc lifecycle or drift cleanup → `/skill:repo-hygiene`.
8. Canvas diagram request → `/skill:tldraw-diagrams`.
9. Code changed or a PR/diff needs checking → `code-review`.
10. Session needs transfer → `handoff`.
11. Ambiguous goal or unresolved decisions → `grill-with-docs`.
12. Clear conversation but no written target → `to-spec`.
13. Spec/plan exists and needs execution slices → `to-tickets`.
14. Approved ticket/spec exists → `implement`; for weakly tested brownfield code, also load `references/legacy-refactor.md` and pin current behavior first.

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

- `/skill:domain-modeling` — the active glossary/ADR discipline that `grill-with-docs` and `to-spec` drive; it resolves repository-declared authorities before fallback `CONTEXT.md` and ADR formats.
- `/skill:codebase-design` — deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for `implement`, `code-review`, and `diagnose` when architecture is the topic.
- `/skill:prototype` — throwaway logic/UI prototypes when a question can't be settled in conversation; detour from `grill-with-docs`, bridged by `handoff`.
- `/skill:wayfinder` — the planning layer above this flow for multi-session efforts: charts a map of grilling/prototype/research tickets under `.scratch/`, resolves one per session, then merges in at `to-spec`.
- `/skill:git-rules` — commit checkpoints and merge-conflict resolution.
- `/skill:repo-hygiene` — keeps non-code artifacts honest: create-time lifecycle gate plus a subagent-assisted drift sweep; runs at `handoff` and whenever docs accumulate.
- `/skill:tldraw-diagrams` — turns architecture/workflow discussion or an ASCII sketch into a real tldraw canvas (installs tldraw offline if missing); useful during `to-spec` and `handoff`.
- `/skill:react-best-practices` — React perf/architecture rules (waterfalls, bundle, re-renders, composition) for `implement` and `code-review` on frontend code; pairs with `/skill:make-interfaces-feel-better` via the `/fe-polish` prompt.

## Pi Subagent Orchestration Contract

The parent session owns scope, delegation, synthesis, and final acceptance. Children receive narrow role-specific tasks; they do not launch subagents or make unapproved product, architecture, API, data, or scope decisions. A blocked child escalates through the available supervisor/intercom bridge instead of guessing.

Use `pi-subagents` when it improves isolation or review quality:

- `scout` / `context-builder` — fresh-context repository reconnaissance and handoff material.
- `researcher` — fresh-context web/docs research with citations.
- `planner` — plan from an approved spec; fresh unless the normative context gates permit a narrative-history fork; no edits.
- `worker` — the sole writer for an approved implementation or fix pass; fresh with a written brief by default.
- `reviewer` — fresh-context, review-only independent checks.
- `oracle` — fresh advisory review for risky decisions or context drift; no edits unless explicitly assigned as the sole writer.

Every subagent launch **must** follow `references/delegation-policy.md`, the single normative source for attribution, brief shape, routing, fresh/fork choice, explicit acceptance, concurrency, budgets, control, claim verification, and fan-in evidence. Do not replace it with package inference or role-name assumptions.

Treat a worker handoff as intermediate: validate from the parent, run independent review, synthesize accepted fixes through one writer, and re-review substantial fixes. When both review axes are required and genuinely sealed, they may run in parallel under the policy.

For two-axis review, use focused fresh-context reviewers:

- Standards reviewer: coding standards, maintainability, smells, simplicity.
- Spec reviewer: requested behavior, acceptance criteria, tests, and validation evidence.

## Workflow Summaries

### Grill With Docs

Read `references/grill-with-docs.md` when requirements are ambiguous or domain language is unclear.

Output artifacts:
- Repository-declared glossary authority; fall back to `CONTEXT.md` when none exists.
- Repository-declared ADR authority; fall back to `docs/adr/NNNN-title.md` when none exists.

### To Spec

Read `references/spec-and-tickets.md`.

Output artifacts:
- Use the repository-declared living spec authority first; fall back to `docs/specs/<slug>.md` only when no convention exists, or use a user-selected path.
- Include goal, non-goals, requirements, acceptance criteria, risks, and validation plan.

### To Tickets

Read `references/spec-and-tickets.md`.

Output artifacts:
- `.scratch/<slug>/tickets.md` inside an existing/created registered effort by default, unless the repo has an issue tracker convention.
- The effort must have `index.md` (or a Wayfinder `map.md`) and follow `references/scratch-organization.md`.
- Tickets should be tracer bullets: small, end-to-end, independently verifiable.

### Implement

Read `references/implementation-tdd.md`, `references/autonomous-execution.md`, and `references/completion-evidence.md`. When the target code has weak or no tests (brownfield/legacy), also read `references/legacy-refactor.md` and pin current behavior before changing it.

Rules:
- Do not implement a large ambiguous plan without approval.
- Prefer small vertical slices.
- Refactoring untested/legacy code: characterize current behavior first, refactor under green, change behavior last (`references/legacy-refactor.md`).
- Run focused checks often; full suite at the end when feasible.
- After implementation, run `code-review` before final summary.
- After review, use `/skill:git-rules` to prepare a commit-ready checkpoint and propose a Conventional Commit message.

### Code Review

Read `references/code-review.md` and `references/completion-evidence.md`.

Review axes:
- **Standards** — repo conventions, maintainability, smell baseline.
- **Spec** — requested behavior, missing requirements, scope creep.

Keep findings separated.

### Diagnose

Read `references/diagnosing-bugs.md`.

Loop:
- reproduce → minimise → hypothesise → instrument → fix → regression-test.

### Handoff

Read `references/handoff.md` and `references/completion-evidence.md`.

Output a compact continuation artifact with goal, state, decisions, files changed, validation evidence, risks, and next steps.

## Safety

- Do not run destructive commands without explicit approval.
- Do not commit unless the user explicitly asks or confirms the commit-ready checkpoint.
- Preserve Pi critical UI/context visibility when changing harness resources.
- If using packages/extensions, avoid duplicate tool names.

## Integration References

Load only when needed:

- `references/pi-harness-integration.md` — boundary and handoff between engineering workflow and Pi harness work.
- `references/autonomous-execution.md` — approval envelope, stop conditions, batched questions, terse reporting.
- `references/completion-evidence.md` — acceptance-to-evidence completion contract.
- `references/delegation-policy.md` — normative subagent routing, launch, control, fidelity, and claim-verification contract.
- `references/legacy-refactor.md` — brownfield safety: characterization/golden tests to pin current behavior before refactoring untested code.
- `references/research.md` — source-backed research flow using `pi-web-access` and `researcher`.
- `references/artifact-lifecycle.md` — lifecycle classes, authority boundaries, and anti-drift rules.
- `references/scratch-organization.md` — create-time gate, canonical Markdown destinations, one-effort scratch layout, naming, orphan detection, and close-out.
- `references/response-shape.md` — the single normative source for final user-facing prose shape; governs only the prose wrapper, never tool payloads, evidence records, commits, tickets/specs/ADRs, handoff structure, subagent briefs, or exhaustive findings.

## Done Criteria

For engineering tasks, follow `references/completion-evidence.md`. Shape final user-facing prose per `references/response-shape.md`: answer/result/blocker/decision first, no filler preamble or closer, recurring state in the TUI/status, and every blocker/failure/finding/unverified criterion preserved (ranked and grouped, never capped).

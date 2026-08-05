# Agentkit Discipline Port

> **Lifecycle:** living specification. Update or delete this file in the same change that alters the ported discipline content. Code and the normative skill references remain the source of truth.
> **Status:** approved for ticket design.
> **Source material:** `/Users/dat/Projects/exp/agentkit/.claude/agents/*.md`, `/Users/dat/Projects/exp/agentkit/.claude/skills/ak-fable-thinking/**`, and `/Users/dat/Projects/exp/agentkit/.claude/skills/ak-git/**` (external repository, read-only reference evidence). Never copy persona prose, Claude Code frontmatter, Team Mode sections, relay protocols, model branding, or `ak:`/hook mechanics into this package.

## Goal

Port the durable engineering discipline content from the agentkit Claude Code agent kit into pi-dev-harness **without importing its persona-agent architecture**. The harness keeps its own shape: thin builtin subagent roles (`scout`, `worker`, `reviewer`, `oracle`, `planner`, `researcher`) driven by normative skill references, a parent session that owns scope/delegation/synthesis/acceptance, one mutation owner at a time, and evidence-driven completion.

The port must:

1. strengthen existing references with agentkit's verification checklists and methodology where the harness has a thinner equivalent;
2. add exactly two new surfaces where the harness has no equivalent: one reference (diff-aware test selection) and one skill (the reasoning protocol from `ak-fable-thinking`, rebranded);
3. keep every change doc-only — no new extensions, tools, agents, or prompts;
4. preserve the harness voice: short, normative, evidence-first; no persona framing, no model pinning, no caps that conflict with the response-shape contract;
5. leave explicitly rejected agentkit content out, with the rejection recorded here.

## Context

Reviewed agentkit agents and their disposition:

| Agentkit agent | Disposition | Target surface |
|---|---|---|
| `code-reviewer` | port AI-risk lens + production checklist | `skills/engineering-workflow/references/code-review.md` |
| `planner` | port Verification Discipline (5 rules) | `references/delegation-policy.md`, `references/spec-and-tickets.md` |
| `debugger` | port competing-hypotheses / elimination discipline | `references/diagnosing-bugs.md` |
| `tester` | port diff-aware test mapping (strategies + escalation) | new `references/diff-aware-testing.md` |
| `kongming` | port autonomy contract for advisory children | `references/delegation-policy.md` (oracle brief) |
| `brainstormer` / `advisor` | port alternatives/assumption checklist | `references/grill-with-docs.md`, `references/spec-and-tickets.md` |
| `docs-manager` | port docs-ownership + evidence layers + accuracy protocol | `skills/repo-hygiene/SKILL.md` (or its references) |
| `code-simplifier` | port as read-only simplicity reviewer angle | `references/code-review.md` |
| `fullstack-developer` | port file-ownership rule for parallel writers | `skills/batch-implementation/SKILL.md`, `references/delegation-policy.md` |
| `researcher` | port source-credibility / ranked-recommendation checklist | `references/research.md` |
| `ak-fable-thinking` skill | port as new brandless skill (reasoning protocol + 3 references) | new `skills/reasoning-discipline/` |
| `ak-git` skill | port mechanics into existing skill (secret scan, split procedure, message rules, recovery, branch/PR gates); reject `ask_user` menus, `git-manager` subagent, `git add -A` staging, numeric file/line caps, `.claude` special cases | `skills/git-rules/` |
| `explore`, `git-manager`, `project-manager`, `ui-ux-designer`, `journal-writer`, advisor relay protocol, Team Mode, `memory:` MEMORY.md, `## Naming` hooks, `repomix`, model pinning (`fable`/`opus`/`haiku`) | **rejected** | covered by existing harness surfaces or in conflict with harness mindset (see Non-goals) |

## Non-goals

- No new subagent personas, agent files, or `.pi/settings.json` changes in this package.
- No model branding: the ported reasoning skill drops the "Fable" name and every model-identity claim; the protocol is presented as model-agnostic discipline, which is what it already is mechanically.
- No journal/diary artifact class: it conflicts with `repo-hygiene` ("the codebase is the single source of truth"; finished reports are deleted, not hoarded). Lessons-learned stay inside the existing `handoff` structure (decisions, risks, next steps).
- No relay/re-spawn interview protocol: the Pi parent interviews the user directly via `grill-with-docs`; children never interview the user.
- No Team Mode / task-claiming prose: pi-subagents intercom/supervisor and `ticket-runner` own that runtime behavior.
- No hard numeric caps on report length or list size (response-shape contract forbids capping findings).
- No changes to extensions, lib, tests-of-runtime-behavior, evals, or release surfaces.

## Requirements

- **R1 — Review hardening.** `code-review.md` gains a review posture (assume AI-authored code; verify against diff, surrounding code, project rules, runnable checks; no rubber-stamping), an AI-assisted-code risk lens (unanchored generic helpers, parallel reimplementation of existing utilities, catch-and-swallow, `any` widening / lint suppression, phantom tests, scope drift), and a pre-submit production checklist (concurrency/races, error boundaries, API contract assumptions, backward compatibility, boundary input validation, authn+authz both checked, N+1/unbounded queries, PII/secret leakage, plan-claim fact-check by re-grep). Both review axes inherit the lens through their briefs.
- **R2 — Plan verification.** Planner-facing guidance gains five verification rules: re-grep instead of trusting scout summaries; cite `file:line` or tag `[UNVERIFIED]`; trace control flow instead of assuming behavior; enumerate callers instead of "update all callers"; check instantiation lifetime before adding state to shared structures.
- **R3 — Diagnosis hardening.** `diagnosing-bugs.md` requires multiple competing hypotheses (the file's pre-existing Phase 3 standard is 3–5 ranked) before committing to one, a documented elimination path, a correlated timeline (logs, commits, deploys, config changes), an evidence-chained root cause (no "probably"), and a recurrence-prevention note.
- **R4 — Diff-aware testing.** New `references/diff-aware-testing.md` defines mapping strategies in priority order (co-located → mirror dir → import graph → config/infra change → high fan-out module), auto-escalation to full suite, known pitfalls (barrel files, test helpers as config, renames), unmapped-file flagging, and the compact selection report format. `implementation-tdd.md`, `engineering-workflow/SKILL.md`, and the `implement`/`code-review` prompts wire it in.
- **R5 — Advisory autonomy.** The oracle/advisor brief in `delegation-policy.md` states: an advisory child never asks the caller or user a question; missing information becomes a recorded assumption with confidence (high/medium/low) and the evidence that would flip it; unresolvable user-only forks get a recommended default plus the flip condition; the deliverable is one complete final message (TL;DR first, recommendation, what to avoid, alternatives with honest costs, checklist, success metrics, assumptions); advisory-only, no edits.
- **R6 — Alignment hardening.** `grill-with-docs.md` / `spec-and-tickets.md` require, before locking a direction: at least one core assumption explicitly challenged; 2–3 genuinely different alternatives (not variations); the simplest viable option named; second-order effects stated; the decision recorded through the ADR authority (`/skill:domain-modeling`).
- **R7 — Docs ownership.** `repo-hygiene` gains: "code owns WHAT and HOW; docs own only WHY and WHERE"; the four evidence layers (intent / current decisions / current evidence / stateful records) kept distinct and labeled; an accuracy protocol (verify symbols, CLI flags, config keys, links, examples before keeping a claim; narrow or mark uncertain claims instead of filling gaps).
- **R8 — Simplicity pass + parallel file ownership.** `code-review.md` documents an optional read-only simplicity reviewer angle (behavior-preserving simplification proposals only; the parent remains the sole writer). `batch-implementation` and the worker brief require declared file ownership for concurrent writers in separate worktrees, with stop-and-report on detected overlap.
- **R9 — Research rigor.** `research.md` requires ≥3 independent sources for key claims, source-credibility weighting (official docs/maintainers/production case studies over tutorials), a trade-off comparison across relevant dimensions, adoption-risk assessment (maturity, breaking-change history, abandonment risk), and a ranked recommendation rather than an option list.
- **R10 — Reasoning protocol skill.** New `skills/reasoning-discipline/SKILL.md` ports the `ak-fable-thinking` protocol brandlessly: known model failure modes; the never-skipped Floor (goal as end-state, follow-through to the verified goal frame, leftover details); the proportionality gate (Direct/Standard/Full); the Constraint Loop for mechanically checkable output constraints; the five moves (FRAME, GROUND, REASON, ATTACK, DELIVER); Claim Discipline (OBSERVED/DERIVED/PRIOR/ASSUMED with grammar rules); altitude control; when-stuck reframing; portable techniques; harness leverage rewritten for the Pi tool inventory; the binary self-review gate; the anti-pattern table.
- **R11 — Reasoning protocol references.** Port the three references into the new skill's `references/`: `worked-examples.md` (end-to-end traces), `design-taste.md` (protocol applied to UI/frontend deliverables), `content-taste.md` (protocol applied to English/Vietnamese prose). Each is deduplicated against the harness authority it touches.
- **R12 — Deference and wiring.** The new skill defers explicitly: `response-shape.md` stays the single normative source for final user-facing prose shape (Move 5 and content-taste govern reasoning quality and prose craft, never the shape contract); `completion-evidence.md` stays the authority for completion claims (Claim Discipline cross-references it); `diagnosing-bugs.md` stays the bug-diagnosis loop (Move 3 cross-references it, consistent with R3); `make-interfaces-feel-better` stays the craft-rule authority for UI polish (design-taste covers the verification loop and cross-links it). The skill is wired into `engineering-workflow/SKILL.md` (companion skills + phase router where reasoning depth is the need), and README's skill list/count is updated.
- **R13 — Commit-boundary hardening.** `git-rules` gains: a mechanical staged-diff secret scan (key/token/password/credential/private-key/DB-URL patterns plus sensitive filename check) that blocks the commit proposal on a hit, with the note that the `safe-ops` guardrail complements but does not replace the scan; a mechanical split procedure for mixed changes (group intended files by Conventional type + scope; sequential precisely-staged commits per group; never blanket staging); subject-line rules (≤72 chars, imperative, no trailing period, WHAT not HOW, never AI attribution or AI co-author trailers); and an error-recovery reference (undo unpushed commit, abort merge/rebase, discard changes — every destructive recovery requires explicit user confirmation; never rewrite pushed history).
- **R14 — Branch and PR readiness.** `git-rules` gains a branching/PR reference: evidence-first branch naming (follow the repository's existing convention; fallback `<type>/<slug>`), branch lifecycle (branch from the updated default, rebase policy, delete after merge), force-push protection (never to default/production/release branches; feature branches only after rebase and only when solely owned), remote-first comparisons for PR diffs, PR creation with validation evidence in the body, and merge readiness gates (refuse on conflicts, red CI, or changes-requested review; verify post-merge CI). All push/PR/merge operations require explicit user authorization per the autonomous contract — commit permission never implies them.

## Acceptance criteria

- Every requirement lands as edits inside the listed target files only; `git status` shows no runtime-source, settings, or dependency changes.
- New/changed prose matches the surrounding reference style: normative, second-person-free, concise, no persona names, no agentkit/Claude/Fable/`ak:` terminology.
- `skills/reasoning-discipline/` loads as a discoverable skill after `/reload`, appears in the pack file list, and contains no second authority for response shape, completion evidence, bug diagnosis, or UI craft rules — only cross-references.
- `references/diff-aware-testing.md` is listed in `engineering-workflow/SKILL.md`'s Integration References and reachable from `implementation-tdd.md` and the `implement`/`code-review` prompts.
- `npm test` and `npm run pack:check` pass; the new reference file appears in the pack file list (`skills/**` glob).
- A follow-up `/harness-review` (or `/audit-pi-harness`) pass reports no drift introduced by these edits.

## Risks

- **Voice drift:** agentkit prose is persona-heavy; verbatim porting would bloat references. Mitigation: rewrite every item in the house style; reviewers check tone as a Standards finding.
- **Duplication of authority:** several targets already state adjacent rules (e.g. delegation-policy claim verification vs R2). Mitigation: extend existing sections instead of adding parallel sections; one authority per rule.
- **Reference sprawl:** only the R4 reference and the R10/R11 skill are new; everything else must fit existing surfaces.
- **Authority collision:** the reasoning skill touches four existing authorities (response shape, completion evidence, diagnosis, UI craft). Mitigation: R12 deference clauses are acceptance criteria, reviewed as Spec findings.

## Validation plan

Per ticket: `npm test`, `npm run pack:check`. After the batch: `npm run smoke:installed`, then a harness drift audit. Doc-only edits are reversible and sit inside one approval envelope.

---
description: Run the harness self-improvement loop — audit, classify into an evolution backlog, sequence and apply safe changes
argument-hint: "[focus or track]"
---

Run the Pi harness **self-improvement loop** using `/skill:pi-harness` (Phase 0 audit + principle #5 "audit and evolve").

Scope: $ARGUMENTS (default: full harness — AGENTS.md, `.pi/APPEND_SYSTEM.md`, skills, prompts, extensions, themes, settings, tests).

## 1. Audit (evidence-driven)

Inspect the live harness, do not trust prior claims:

- Drift between `AGENTS.md` claims and actual files (missing/renamed/undocumented resources).
- Duplication or unclear tiering across skills and prompts.
- Stale commands, dead references, naming that leaks project identity into reusable resources.
- Extension lifecycle cleanup, tool/package conflicts, TUI critical-info visibility.
- Test health: discover and run the repository's harness/resource checks; use `npm run test:harness` only when that script exists. Report pass/fail counts.

## 2. Classify into evolution tracks

Sort every finding into exactly one track:

| Track | Meaning |
| --- | --- |
| **Maintenance** | drift, doc gaps, stale refs, safe renames |
| **Consolidation** | overlap/redundancy to merge or explicitly tier |
| **Capability** | a missing behaviour worth adding |
| **Packaging** | make reusable resources portable across projects |

## 3. Persist the backlog

Create or update `.scratch/harness-evolution/backlog.md`:

- One row per item: `id | track | finding (file:line) | risk | status (todo/doing/done/deferred)`.
- Preserve existing rows; mark completed ones `done` with the commit hash.
- Keep it the single source of truth for harness evolution across sessions.

## 4. Sequence and apply

- Apply **Maintenance** (low-risk) items now; keep edits small and reversible.
- For **Consolidation / Capability / Packaging**, present one sequenced approval batch with recommended defaults; get confirmation once before large changes, not per item (per `/skill:pi-harness` Phase 0).
- Never delete a resource without grepping the repo for references and checking `docs/plans/` for intentional design.

## 5. Validate + checkpoint

- `/reload` succeeds; new commands appear in autocomplete; no tool-name conflicts.
- Repository-native harness/resource checks stay green (report commands and counts).
- Prepare a commit-ready checkpoint per `/skill:git-rules` (`docs(harness):` / `refactor(harness):` / `feat(harness):`). Do not commit without confirmation unless the user already approved the batch.

Report tersely: counts/findings by track, applied, deferred reasons, recommended next batch. Expand only blockers, decisions, risks, or failed validation.

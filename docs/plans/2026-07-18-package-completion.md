# Pi Dev Harness Package Completion Implementation Plan

> **Executor:** Work task-by-task with one writer and fresh read-only review.

**Goal:** Turn `pi-dev-harness` into an installable, self-tested Pi package with portable workflow resources, safe autonomous execution, and no project identity leakage.

**Architecture:** Package generic skills/prompts plus the reusable ticket-runner and safe-ops extensions. Keep product TUI/theme, memory implementation, auth, vision, and project preferences outside the package. Project overlays stay in `AGENTS.md`.

**Tech Stack:** Pi package manifest, TypeScript extensions, Node 22 native tests, Markdown skills/prompts.

---

### Task 1: Add deterministic package tests and extension modules

- Add ticket-runner, readiness, continuation, gate runner, safe-ops policy/extension.
- Add native tests and `npm test`.
- Verify red/green by running focused tests before/after copies where practical.

### Task 2: Add autonomous execution and evidence contracts

- Add `autonomous-execution.md` and `completion-evidence.md` references.
- Link implement, review, batch, readiness, git workflows.
- Batch questions; continue approved reversible work; stop for irreversible/production/security/unapproved decisions.
- Default report: shortest useful form; expand only on exceptions.

### Task 3: Complete reusable release and prompt surface

- Add risk-based `release-check` skill/prompt.
- Rename shadowed `/implement-all` prompt to `/implement-batch`; extension owns `/implement-all`.
- Correct session-review/handoff tiering and multi-word argument handling.
- Fix internal links and project-identity leakage.

### Task 4: Package, install, and cut over

- Update manifest, README, LICENSE, version.
- `npm test`; `npm pack --dry-run`; project-identity/link/conflict scans.
- Install local package globally; verify resource discovery.
- Only after clean smoke: move project-local duplicate skills/prompts to reversible `.scratch` backup.

### Task 5: Validate and review

- SDK reload smoke: extensions, commands, tools, skills, prompts, diagnostics.
- Run the consumer project's harness tests after cutover.
- Fresh package review; fix blockers/majors; rerun checks.
- Commit-ready checkpoints for package repo and tracked `AGENTS.md`; do not commit without explicit confirmation.

### Task 6: Harden new-project portability

- Add a framework-neutral project setup contract covering repo/workspace roots, validation commands, review base, artifact paths, release/deploy authority, and optional capabilities.
- Remove Node/npm/single-release-module assumptions from generic workflow paths; keep React prompts explicitly optional.
- Define monorepo working-directory and review-base fallbacks.
- Make subagent-unavailable self-review fallback explicit in autonomous runner messages.
- Add a repeatable installed-package SDK smoke and document pin/upgrade/rollback/collision behavior.
- Validate package tests, pack closure, installed SDK discovery, fresh-project behavior, consumer regression, and independent review.

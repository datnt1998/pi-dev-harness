---
name: batch-implementation
description: Autonomously implement a pre-approved batch of ready tickets with parent-writer implement/validate/fresh-review/fix loops, self-recovery, progress persistence, and safe escalation. Use when /implement-all is active or the user asks to implement all tickets without per-ticket confirmation.
---

# Batch Implementation Runner

Drive an approved ticket batch to completion without asking between tickets. Calling `/implement-all` pre-approves every runnable ticket in scope. Follow `/skill:engineering-workflow` references `autonomous-execution.md` and `completion-evidence.md`. The packaged `ticket-runner` owns durable state, ordering, retry caps, and guarded continuation; the parent owns implementation and escalation.

## Preconditions

- Either a batch is active (started by `/implement-all`) or this skill was invoked with a gated manifest/ticket path. If neither is available, tell the user to run `/prepare-tickets` then `/implement-all`.
- Tickets were gated by `/skill:ticket-readiness`; run only READY/AUTO_FIXED tickets, whether state comes from the extension or the manual fallback.
- The parent session is the sole writer for the active batch worktree. Use async fresh-context `pi-subagents` only for review/validation; do not launch `worker` or any other writer subagent into that worktree.

## Loop

Repeat until `batch_next` reports the batch is not actionable:

1. Call `batch_next`. It returns one ticket (marked in progress) with its acceptance criteria and validation, or a stop reason.
2. Implement that ticket in small vertical slices. Follow `/skill:engineering-workflow` implement discipline: prefer a failing test first when feasible, minimal change, focused checks.
3. Validate using the ticket's Validation commands (and repo `test:harness`/`build` when relevant). The child subagent shell may be unavailable; run validation from the parent when needed.
4. Review before completing: when `pi-subagents` is available, run an async fresh-context, review-only reviewer for spec compliance, validation evidence, and code quality via `pi-subagents` (`agent="reviewer"`, `context="fresh"`, `output=false`, a bounded `turnBudget`; omit `acceptance` and use package inference). Preserve its evidence, synthesize findings in the parent, and apply only fixes within the ticket's scope. If the fix is substantial, run one focused re-review. If `pi-subagents` is unavailable or the per-session budget is exhausted (spawn limit reached), fall back to a **structured self-review** (see Environment fallbacks) — do not skip review.
5. Call `batch_report` with the outcome and an evidence note containing validation commands/results, reviewer or fallback result, fixes applied, and residual risks:
   - `completed` — acceptance criteria met, validation passed, and review has no unresolved in-scope blocker.
   - `retry` — a fixable failure; the extension re-queues until the retry cap, then fails.
   - `failed` — unrecoverable within scope after retries.
   - `blocked` — external/environment/dependency blocker.
   - `needs_decision` — an unapproved product/architecture/scope/API/data decision, or a destructive/credential/production action.
6. The extension automatically continues to the next actionable ticket on the next turn. Do not wait for the user.

## Autonomous self-recovery (no confirmation)

Handle these inside the loop and keep going:

- Type errors, lint failures, test failures, build breaks: fix and re-validate (`retry`).
- Reviewer findings inside the ticket's scope: synthesize and apply in the parent writer pass; re-review substantial fixes.
- Missing tests for existing acceptance: add them.
- Wrong-but-clear API/library usage: correct it.
- Flaky/transient failures: retry within the cap and record evidence.

## Environment fallbacks (keep going, no confirmation)

These are runtime limits, not blockers — handle them and continue:

- **No active batch** (`batch_next` returns "No active ticket batch"): the `ticket-runner` extension only initializes a batch from the `/implement-all <path>` command. When invoked purely via `/skill:batch-implementation` (or when the runner is not active), do not stall — run the loop **manually**: read the gated `tickets.md`/`execution-manifest.md`, take tickets in dependency order, and for each do implement → validate (`test`/`build` + preview for UI) → review → scoped commit (if `--commit`) → narrate outcome. Report progress the same way (`batch_report`-style summary) even without the extension's bookkeeping.
- **Subagents unavailable or budget exhausted** (package absent or per-session spawn limit reached): switch to a **structured self-review** in place of the fresh-context reviewer — re-read the changed files, check each acceptance criterion explicitly, look for the same classes the reviewer would (data-loss/clobber, stale closures, dedup/idempotency, timezone/midnight, empty/no-op paths, file-size budget), fix findings, and record in the ticket note that self-review was used and why. Never silently skip review.
- **Child subagent shell unavailable**: run validation (`test`/`build`/`preview`) from the parent.

## Always escalate (report, do not guess)

Use `needs_decision` (or `blocked`), continue independent tickets, then present one deduplicated numbered decision batch with recommended safe defaults:

- New product/architecture/scope/API/data-model decisions not in the ticket or spec.
- Destructive commands, credentials, migrations, or production/deploy actions.
- Contradictions with `CONTEXT.md`/spec.
- A dirty or ambiguous git state that risks overwriting unrelated work.

Dependencies: if a ticket fails, blocks, or is marked `needs_decision`, the extension skips its dependent tickets automatically and keeps working independent tickets. Skipped dependents are not resumed within the same run — after the user resolves the decision or blocker, re-gate and re-run `/implement-all` so those tickets return to the queue.

## Commit policy

- Default (`/implement-all <path>`): do not commit. Prepare a commit-ready checkpoint per `/skill:git-rules` at the end.
- With `--commit`: after a ticket is validated and review is clean, commit only that ticket using `/skill:git-rules` — inspect diff, stage exact paths (never `git add -A`), one Conventional Commit per ticket. If the repo has unrelated/dirty changes, stop and escalate instead of committing.

## Completion

When `batch_next` reports done, run `/implementation-status`. Happy path: one terse completion line with checks/review/commit. Expand only failed, blocked, needs-decision, unverified, or residual-risk items. Never mark the batch complete while blockers or decisions remain.

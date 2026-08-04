---
name: batch-implementation
description: Autonomously implement a pre-approved batch of ready tickets with eligibility-routed parent/worker writers, exclusive leases, validate/fresh-review/one-fix loops, self-recovery, progress persistence, and safe escalation. Use when /implement-all is active or the user asks to implement all tickets without per-ticket confirmation.
---

# Batch Implementation Runner

Drive an approved ticket batch to completion without asking between tickets. Calling `/implement-all` pre-approves every runnable ticket in scope. Follow `/skill:engineering-workflow` references `autonomous-execution.md`, `completion-evidence.md`, and the normative `../engineering-workflow/references/delegation-policy.md` for every subagent call. The packaged `ticket-runner` owns durable state, ordering, retry caps, exclusive writer leases, and guarded continuation; the parent owns eligibility, validation, finding disposition, final gate, and escalation.

## Preconditions

- Either a batch is active (started by `/implement-all`) or this skill was invoked with a gated manifest/ticket path. If neither is available, tell the user to run `/prepare-tickets` then `/implement-all`.
- Tickets were gated by `/skill:ticket-readiness`; run only READY/AUTO_FIXED tickets, whether state comes from the extension or the manual fallback.
- Exactly one exclusive writer lease may be open for the active worktree. Async never implies concurrent writing. Reviewers never acquire mutation authority from role wording or read-only acceptance metadata; they remain sealed observation-only. Only parent, worker, or fix-writer roles may hold a lease.
- Drive the lease lifecycle through `batch_writer_lease` (`acquire`, `close`, `reconcile`, `review_allowed`). A self-asserted closed lease in `batch_report` without a matching recorded handoff is rejected. Non-completed outcomes must close or fail with the lease rather than orphan mutation authority.
- Record an explicit parent eligibility decision before mutation, with facts that match the reason (`tinyKnownDiff`, `leaseSafetyAvailable`, important-reasoning class, and worker conditions). Default to the parent writer lane. Use a worker-writer only when architecture/product decisions are frozen, scope and allowed paths are explicit and reversible, the parent states a falsifiable bar before launch, validation/replay is available, fresh context and checked acceptance are used, lease safety is enforceable, and the assignment is in the approved pilot. Unknown/mixed important reasoning fails closed to the parent lane or a decision packet.

## Loop

Repeat until `batch_next` reports the batch is not actionable:

1. Call `batch_next`. It returns one ticket (marked in progress) with its acceptance criteria and validation, or a stop reason.
2. Record eligibility and acquire the exclusive writer lease for this work unit via `batch_writer_lease`. Implement in small vertical slices under that lease. Prefer a failing test first when feasible, minimal change, focused checks. Do not launch a second writer into the same worktree.
3. Validate using the ticket's Validation commands (and repo `test:harness`/`build` when relevant). The child subagent shell may be unavailable; run validation from the parent when needed.
4. Close the writer handoff before review via `batch_writer_lease` action `close`: record the parent-observed stable implementation fingerprint after all writer mutation stops. Confirm `review_allowed` before review. Review cannot begin while any writer lease is open. Review before completing with **two separate logical calls** against that exact fingerprint: a fresh Standards axis for code quality and a fresh Spec axis for scope, behavior, acceptance, and validation evidence. Each reviewer is observation-only and must prove a sealed read-only capability or serialized pre/post mutation fingerprints; a role label or a no-edit instruction is not evidence. Run the axes in parallel only when both seals are proven; otherwise serialize them. Before an affected review stage, compare the target with configured/resolved producer and axis provenance. If actual provider/model/fallback/effective-model/effective-thinking facts cannot prove the target, show the complete warning and obtain the explicit operator **continue** acknowledgment before launching that stage; the terminal envelope then persists and repeats it. Record actual provider/model provenance, fallback state, and effective-model/effective-thinking confidence rather than requested routing. Actual three-provider diversity with no fallback and verified effective route facts is provider-distinct. Provider overlap, fallback, or unknown/unverified effective model or thinking requires the complete degraded-topology warning (target/configured/actual identities, missing or overlapping facts, quality consequence, configuration guidance) and an explicit operator **continue** acknowledgment. It remains degraded, never independent or clean pilot evidence. Missing axis, combined/self review, stale fingerprint, unsealed review, or observed reviewer mutation fails closed and cannot use the degradation exception. The launch uses the ticket's attribution marker, a parent-known falsifiable bar, contract v1 with explicit minimal checked acceptance, and the budgets/report shape in `../engineering-workflow/references/delegation-policy.md`; never rely on package inference. Preserve separate axis evidence and parent-verify and parent-dispose every load-bearing finding with replay evidence **before** any fix lease.
5. Permit one bounded fix-worker round only: parent emits a fix brief containing only accepted in-scope findings; one cheap fix writer may acquire the lease (paths must stay inside both the brief scope and eligibility scope) and apply it; close that fix lease with a stable handoff; parent revalidates; focused two-axis re-review must meet the same load-bearing integrity as final axes (fresh, sealed, distinct calls, usable verdicts, dispositions, final fingerprint). A second substantial fix need, repeated finding, reviewer conflict, or semantic ambiguity escalates with replayable evidence rather than looping. If the parent implements after a delegated worker attempt, record that work as explicit rework/strong-route evidence—never hidden recovery.
6. Call `batch_report` with the versioned structured envelope—not prose—containing eligibility, closed writer handoff matching the recorded lease lifecycle, stable fingerprint, separate sealed axis evidence, actual route provenance, parent finding dispositions, fix-round state (including closed fix-lease evidence when applied), validation commands/results, C1–C7 and claim verdicts, and residual risks. Repeat a degraded warning and explicit continue acknowledgment in terminal evidence:
   - `completed` — acceptance criteria met, validation passed, review has no unresolved in-scope blocker, and no action-driving claim is unchecked or unverifiable.
   - `retry` — a fixable failure; the extension re-queues until the retry cap, then fails.
   - `failed` — unrecoverable within scope after retries.
   - `blocked` — external/environment/dependency blocker.
   - `needs_decision` — an unapproved product/architecture/scope/API/data decision, or a destructive/credential/production action.
7. The extension automatically continues to the next actionable ticket on the next turn. Do not wait for the user.

## Autonomous self-recovery (no confirmation)

Handle these inside the loop and keep going:

- Type errors, lint failures, test failures, build breaks: fix and re-validate (`retry`).
- Reviewer findings inside the ticket's scope: parent-dispose first; apply at most one bounded fix-worker round; re-review substantial fixes.
- Missing tests for existing acceptance: add them.
- Wrong-but-clear API/library usage: correct it.
- Flaky/transient failures: retry within the cap and record evidence.

## Environment fallbacks (keep going, no confirmation)

These are runtime limits, not blockers — handle them and continue:

- **No active batch** (`batch_next` returns "No active ticket batch"): the `ticket-runner` extension only initializes a batch from the `/implement-all <path>` command. When invoked purely via `/skill:batch-implementation` (or when the runner is not active), do not stall — run the loop **manually**: read the gated `tickets.md`/`execution-manifest.md`, take tickets in dependency order, and for each do eligibility → exclusive lease → implement → validate (`test`/`build` + preview for UI) → close handoff → review → at most one fix round → scoped commit (if `--commit`) → narrate outcome. Report progress the same way (`batch_report`-style summary) even without the extension's bookkeeping.
- **Subagents unavailable or budget exhausted** (package absent or per-session spawn limit reached): keep the parent as writer. The **structured self-review fallback** may aid parent diagnosis, but do **not** substitute it for either required sealed review axis on a completed high-risk/package-policy work unit. Report `blocked` with the capability/evidence gap, or use a parent-approved non-terminal path. It is not a fresh sealed separate call and must never be labeled independent or provider-diverse.
- **Child subagent shell unavailable**: run validation (`test`/`build`/`preview`) from the parent.

## Always escalate (report, do not guess)

Use `needs_decision` (or `blocked`), continue independent tickets, then present one deduplicated numbered decision batch with recommended safe defaults:

- New product/architecture/scope/API/data-model decisions not in the ticket or spec.
- Destructive commands, credentials, migrations, or production/deploy actions.
- Contradictions with `CONTEXT.md`/spec.
- A dirty or ambiguous git state that risks overwriting unrelated work.
- A second substantial fix need, repeated finding, reviewer conflict, or unresolved semantic/evidence ambiguity after the one ordinary fix-worker round.

Dependencies: if a ticket fails, blocks, or is marked `needs_decision`, the extension skips its dependent tickets automatically and keeps working independent tickets. Skipped dependents are not resumed within the same run — after the user resolves the decision or blocker, re-gate and re-run `/implement-all` so those tickets return to the queue.

## Commit policy

- Default (`/implement-all <path>`): do not commit. Prepare a commit-ready checkpoint per `/skill:git-rules` at the end.
- With `--commit`: after a ticket is validated and review is clean, commit only that ticket using `/skill:git-rules` — inspect diff, stage exact paths (never `git add -A`), one Conventional Commit per ticket. If the repo has unrelated/dirty changes, stop and escalate instead of committing.

## Completion

When `batch_next` reports done, run `/implementation-status`. Happy path: one terse completion line with checks/review/commit. Expand only failed, blocked, needs-decision, unverified, or residual-risk items. Never mark the batch complete while blockers or decisions remain.

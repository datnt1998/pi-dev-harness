---
name: batch-implementation
description: Autonomously implement a pre-approved batch of ready tickets with parent-writer implement/validate/fresh-review/fix loops, self-recovery, progress persistence, and safe escalation. Use when /implement-all is active or the user asks to implement all tickets without per-ticket confirmation.
---

# Batch Implementation Runner

Drive an approved ticket batch to completion without asking between tickets. Calling `/implement-all` pre-approves every runnable ticket in scope. Follow `/skill:engineering-workflow` references `autonomous-execution.md`, `completion-evidence.md`, and the normative `../engineering-workflow/references/delegation-policy.md` for every subagent call. The packaged `ticket-runner` owns durable state, ordering, retry caps, and guarded continuation; the parent owns implementation and escalation.

## Preconditions

- Either a batch is active (started by `/implement-all`) or this skill was invoked with a gated manifest/ticket path. If neither is available, tell the user to run `/prepare-tickets` then `/implement-all`.
- Tickets were gated by `/skill:ticket-readiness`; run only READY/AUTO_FIXED tickets, whether state comes from the extension or the manual fallback.
- The parent session is the sole writer for the active batch worktree. Use async fresh-context `pi-subagents` only for review/validation; do not launch `worker` or any other writer subagent into that worktree. A review begins only after the parent closes the writer handoff and records the stable implementation fingerprint.

## Loop

Repeat until `batch_next` reports the batch is not actionable:

1. Call `batch_next`. It returns one ticket (marked in progress) with its acceptance criteria and validation, or a stop reason.
2. Implement that ticket in small vertical slices. Follow `/skill:engineering-workflow` implement discipline: prefer a failing test first when feasible, minimal change, focused checks.
3. Validate using the ticket's Validation commands (and repo `test:harness`/`build` when relevant). The child subagent shell may be unavailable; run validation from the parent when needed.
4. Close the writer handoff before review: record the parent-observed stable implementation fingerprint after all writer mutation stops. Review before completing with **two separate logical calls** against that exact fingerprint: a fresh Standards axis for code quality and a fresh Spec axis for scope, behavior, acceptance, and validation evidence. Each reviewer is observation-only and must prove a sealed read-only capability or serialized pre/post mutation fingerprints; a role label or a no-edit instruction is not evidence. Run the axes in parallel only when both seals are proven; otherwise serialize them. Before an affected review stage, compare the target with configured/resolved producer and axis provenance. If actual provider/model/fallback/effective-model/effective-thinking facts cannot prove the target, show the complete warning and obtain the explicit operator **continue** acknowledgment before launching that stage; the terminal envelope then persists and repeats it. Record actual provider/model provenance, fallback state, and effective-model/effective-thinking confidence rather than requested routing. Actual three-provider diversity with no fallback and verified effective route facts is provider-distinct. Provider overlap, fallback, or unknown/unverified effective model or thinking requires the complete degraded-topology warning (target/configured/actual identities, missing or overlapping facts, quality consequence, configuration guidance) and an explicit operator **continue** acknowledgment. It remains degraded, never independent or clean pilot evidence. Missing axis, combined/self review, stale fingerprint, unsealed review, or observed reviewer mutation fails closed and cannot use the degradation exception. The launch uses the ticket's attribution marker, a parent-known falsifiable bar, contract v1 with explicit minimal checked acceptance, and the budgets/report shape in `../engineering-workflow/references/delegation-policy.md`; never rely on package inference. Preserve separate axis evidence, parent-verify and parent-dispose every load-bearing finding with replay evidence, and apply only accepted fixes within scope. If a fix is substantial, run focused two-axis re-review.
5. Call `batch_report` with the versioned structured envelope—not prose—containing the closed writer handoff, stable fingerprint, separate sealed axis evidence, actual route provenance, parent finding dispositions, validation commands/results, C1–C7 and claim verdicts, fixes applied, and residual risks. Repeat a degraded warning and explicit continue acknowledgment in terminal evidence:
   - `completed` — acceptance criteria met, validation passed, review has no unresolved in-scope blocker, and no action-driving claim is unchecked or unverifiable.
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
- **Subagents unavailable or budget exhausted** (package absent or per-session spawn limit reached): the **structured self-review fallback** may aid parent diagnosis, but do **not** substitute it for either required sealed review axis on a completed high-risk/package-policy work unit. Report `blocked` with the capability/evidence gap, or use a parent-approved non-terminal path. It is not a fresh sealed separate call and must never be labeled independent or provider-diverse.
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

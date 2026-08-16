---
name: batch-implementation
description: Autonomously implement a pre-approved batch of ready tickets with eligibility-routed parent/worker writers, exclusive leases, validate/fresh-review/one-fix loops, self-recovery, progress persistence, and safe escalation. Use when /implement-all is active or the user asks to implement all tickets without per-ticket confirmation.
---

# Batch Implementation Runner

Drive an approved ticket batch to completion without asking between tickets. Calling `/implement-all` pre-approves every runnable ticket in scope. Follow `/skill:engineering-workflow` references `testing-strategy.md`, `autonomous-execution.md`, `completion-evidence.md`, and the normative `../engineering-workflow/references/delegation-policy.md` for every subagent call. The packaged `ticket-runner` owns durable state, ordering, retry caps, exclusive writer leases, and guarded continuation; the parent owns eligibility, validation, finding disposition, final gate, and escalation.

## Preconditions

- Either a batch is active (started by `/implement-all`) or this skill was invoked with a gated manifest/ticket path. If neither is available, tell the user to run `/prepare-tickets` then `/implement-all`.
- Tickets were gated by `/skill:ticket-readiness`; run only READY/AUTO_FIXED tickets, whether state comes from the extension or the manual fallback.
- Exactly one exclusive writer lease may be open for the active worktree. Async never implies concurrent writing. Reviewers never acquire mutation authority from role wording or read-only acceptance metadata; they remain sealed observation-only. Only parent, worker, or fix-writer roles may hold a lease. Single-writer-per-worktree is the default; when the run intentionally launches multiple writers in separate isolated worktrees, each writer's brief declares exclusive file/area ownership and follows the overlap stop-and-report rule owned by `delegation-policy.md`.
- Drive the lease lifecycle through `batch_writer_lease` (`acquire`, `close`, `reconcile`, `review_allowed`). A self-asserted closed lease in `batch_report` without a matching recorded handoff is rejected. Non-completed outcomes must close or fail with the lease rather than orphan mutation authority.
- Record an explicit parent eligibility decision before mutation, with facts that match the reason (`tinyKnownDiff`, `leaseSafetyAvailable`, important-reasoning class, and worker conditions). Default to the parent writer lane. Use a worker-writer only when architecture/product decisions are frozen, scope and allowed paths are explicit and reversible, the parent states a falsifiable bar before launch, validation/replay is available, fresh context and checked acceptance are used, lease safety is enforceable, and the assignment is in the approved pilot. Unknown/mixed important reasoning fails closed to the parent lane or a decision packet.

## Worker brief mechanics

Every worker brief carries these mechanical bans, in addition to the routing and acceptance rules in `delegation-policy.md`:

- every edit-tool entry carries both old and new text; deletion is an explicit empty replacement, never an omitted field, and after a failed or partial write the file is re-read from disk before the next edit;
- no prose, deliberation, or markdown fences in source files;
- no shell brace expansion for paths;
- if the same reasoning repeats more than twice, stop and report;
- never report a command not run, a number not measured, or an identifier not created (`completion-evidence.md` owns the claim rule this bans against).

Validation lists are cited from the ticket/repository contract, never retyped into the brief. A brief may narrow the list only by naming what is skipped and why; a retyped list can silently drop an entry.

## Loop

Repeat until `batch_next` reports the batch is not actionable:

1. Call `batch_next`. It returns one ticket (marked in progress) with its acceptance criteria and validation, or a stop reason.
2. Record eligibility and acquire the exclusive writer lease for this work unit via `batch_writer_lease`. Implement in small vertical slices under that lease. Follow `../engineering-workflow/references/testing-strategy.md`: test application-owned behavior, run repository-native lint/type-check first when available, then the smallest related behavioral guard; broaden only for a named boundary/risk. Prefer a failing behavioral test first when feasible after the static preflight. Do not launch a second writer into the same worktree.
3. Validate using the ticket's Validation commands, interpreted through the testing strategy rather than as a ritual full-suite list. Run sequentially by default. Integration/specialized tests need a named reason; full suites are reserved for repository-required/requested/release gates. The child subagent shell may be unavailable; run validation from the parent when needed.
4. Close the writer handoff before review via `batch_writer_lease` action `close`: record the parent-observed stable implementation fingerprint after all writer mutation stops. Confirm `review_allowed` before review. Review cannot begin while any writer lease is open. Review before completing with **two separate logical calls** against that exact fingerprint: a fresh Axis A — Falsification call attacking the guards via named mutations, and a fresh Axis B — Adversarial authority call deriving violating inputs/scenarios from governing clauses for scope, behavior, acceptance, and validation evidence. Each reviewer is observation-only and must prove a sealed read-only capability or serialized pre/post mutation fingerprints; a role label or a no-edit instruction is not evidence. Run the axes in parallel only when both seals are proven; otherwise serialize them. Before an affected review stage, compare the target with configured/resolved producer and axis provenance. If actual provider/model/fallback/effective-model/effective-thinking facts cannot prove the target, show the complete warning and obtain the explicit operator **continue** acknowledgment before launching that stage; the terminal envelope then persists and repeats it. Record actual provider/model provenance, fallback state, and effective-model/effective-thinking confidence rather than requested routing. Actual three-provider diversity with no fallback and verified effective route facts is provider-distinct. Provider overlap, fallback, or unknown/unverified effective model or thinking requires the complete degraded-topology warning (target/configured/actual identities, missing or overlapping facts, quality consequence, configuration guidance) and an explicit operator **continue** acknowledgment. It remains degraded, never independent or clean pilot evidence. Missing axis, combined/self review, stale fingerprint, unsealed review, or observed reviewer mutation fails closed and cannot use the degradation exception. The launch uses the ticket's attribution marker, a parent-known falsifiable bar, contract v1 with explicit minimal checked acceptance, and the budgets/report shape in `../engineering-workflow/references/delegation-policy.md`; never rely on package inference. Preserve separate axis evidence and parent-verify and parent-dispose every load-bearing finding with replay evidence **before** any fix lease.
5. Permit one bounded fix-worker round only: parent emits a fix brief containing only accepted in-scope findings; one cheap fix writer may acquire the lease (paths must stay inside both the brief scope and eligibility scope) and apply it; close that fix lease with a stable handoff; parent revalidates; focused two-axis re-review must meet the same load-bearing integrity as final axes (fresh, sealed, distinct calls, usable verdicts, dispositions, final fingerprint). A second substantial fix need, repeated finding, reviewer conflict, or semantic ambiguity escalates with replayable evidence rather than looping. If the parent implements after a delegated worker attempt, record that work as explicit rework/strong-route evidence—never hidden recovery.
6. Call `batch_report` with the versioned structured envelope—not prose—containing eligibility, closed writer handoff matching the recorded lease lifecycle, stable fingerprint, separate sealed axis evidence, actual route provenance, parent finding dispositions, fix-round state (including closed fix-lease evidence when applied), validation commands/results, C1–C7 and claim verdicts, and residual risks. For approved pilot-member worker work, also provide explicit operational pilot metrics; absent metrics are retained as incomplete/non-clean, never guessed. The ten-clean window requires six test-bar and two no-test-bar assignments. Repeat a degraded warning and explicit continue acknowledgment in terminal evidence:
   - `completed` — acceptance criteria met, validation passed, review has no unresolved in-scope blocker, and no action-driving claim is unchecked or unverifiable.
   - `retry` — a fixable failure; the extension re-queues until the retry cap, then fails.
   - `failed` — unrecoverable within scope after retries.
   - `blocked` — external/environment/dependency blocker.
   - `needs_decision` — an unapproved product/architecture/scope/API/data decision, or a destructive/credential/production action.
7. The extension automatically continues to the next actionable ticket on the next turn. Do not wait for the user. The serial loop is producer → parent gate → two sealed axes → one fix round → pilot ledger. A pilot trigger records its observation and locator, action, and operator consequence. T1–T4 revert only the implicated role; T5 repairs the implicated scarce-premium configuration and replaces the contaminated row. When worker routing is demoted/disabled, select the parent writer while protocol, decision, review, and degradation controls remain active. Deterministic fixtures prove behavior only; they never promote a route.

## Autonomous self-recovery (no confirmation)

Handle these inside the loop and keep going:

- Type errors, lint failures, test failures, build breaks: preserve the red evidence, diagnose the root cause, fix it, then make one bounded re-validation attempt (`retry`). Never weaken/skip/loosen a valid guard merely to recover green.
- Reviewer findings inside the ticket's scope: parent-dispose first; apply at most one bounded fix-worker round; re-review substantial fixes.
- Missing tests for existing acceptance: add them.
- Wrong-but-clear API/library usage: correct it.
- Flaky/transient failures: a recorded diagnosis is required before any retry, per the red-discipline rule in `../engineering-workflow/references/autonomous-execution.md`; retry within the cap and record evidence only after that diagnosis.

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

- Commit granularity is owned by `/skill:git-rules` ("Long-horizon work commits per ticket, not per batch"): before starting the loop, secure per-ticket commit authorization once. `--commit` or an explicit batch approval is that authorization.
- When authorized: after a ticket is validated and review is clean, commit only that ticket using `/skill:git-rules` — inspect diff, stage exact paths (never `git add -A`), one Conventional Commit per ticket, at that ticket's boundary (never deferred past the next ticket's first edit). If the repo has unrelated/dirty changes, stop and escalate instead of committing.
- When the user declines per-ticket commits: proceed uncommitted but produce a per-ticket commit-ready summary at each boundary; a single end-of-batch mega-commit is a reportable deviation, not a default.

## Completion

When `batch_next` reports done, run `/implementation-status`. Happy path: one terse completion line with checks/review/commit. Expand only failed, blocked, needs-decision, unverified, or residual-risk items. Never mark the batch complete while blockers or decisions remain.

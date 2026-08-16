# Implementation and TDD

Use this reference when implementing an approved spec or ticket.

## Preconditions

Before editing:

- Bind work to the approved spec/ticket/plan.
- Identify affected files, repository/workspace root, and test surfaces from repository evidence.
- In a monorepo, bind the slice to one declared working directory; use ticket-level validation there before root-wide checks.
- If ambiguity blocks safe execution, use `scout`, continue independent work, then ask one batched question set.
- Follow `testing-strategy.md`, `autonomous-execution.md`, and `completion-evidence.md`; if the slice delegates, also follow the normative `delegation-policy.md`.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at approved seams.** Ticket acceptance criteria or an existing public interface are sufficient approval; do not ask again. Ask only when the seam itself requires an unapproved product/API/architecture decision.

For what makes a test good or bad (implementation-coupled, tautological, horizontal slicing) and when to mock, read `tests-and-mocking.md` (same directory). For designing the module shape itself, use `/skill:codebase-design`. When the seam wraps untested/legacy code you are about to refactor, pin its current behavior first with `legacy-refactor.md` (same directory) before changing anything.

## Validation Contract

Before implementation, state the smallest useful contract:

- expected behavior and non-goals;
- the application-owned behavior and public test seams;
- repository-native lint/type-check commands, or evidence that none exist;
- the smallest related behavioral check;
- integration, full-suite, E2E, race, load, or stress gates only when `testing-strategy.md` gives a concrete reason;
- sequential execution by default;
- evidence the writer must return, including failures, diagnoses, retries, unverified criteria, and residual risks.

## Implementation Loop

1. Pick the smallest vertical slice.
2. Discover the repository-native validation commands and run the smallest applicable lint/format-policy and type-check commands first. If absent, record that fact; do not invent tooling.
3. For observable behavior changes and bug fixes, write or update a failing test at an application-owned seam — **red before green**; run the smallest related behavioral command and watch it fail for the intended missing behavior or exact symptom, then write only enough code to pass. Syntax/type/harness failures do not count unless the approved contract is compile-time/type-level. For pure refactors, non-behavioral docs, generated outputs, or work with no correct runnable seam, record the explicit exception, alternative evidence, and residual risk instead of fabricating a red.
4. Make the minimal code change.
5. Re-run affected static checks and the narrowest useful behavioral check, sequentially by default.
6. Refactor only after green feedback (heavier refactoring belongs to the review stage, not the red→green cycle).
7. Repeat — one seam, one test, one minimal implementation per cycle.
8. Escalate to integration or specialized checks only for a named boundary/risk. Reserve the full suite for a repository-required or release gate, not ordinary completion.
9. Classify every red. An expected TDD red proceeds to minimal implementation; a wrong-reason, pre-existing, flaky, unrelated, environment, or recurring red requires root-cause diagnosis before a bounded rerun. Never weaken a guard merely to restore green.
10. Collect validation-contract evidence, then run fresh-context code review, synthesize findings, and apply in-scope fixes with one writer. Re-review substantial fixes.
11. Inspect the final diff and validation evidence before summarizing.
12. Use `/skill:git-rules` to prepare a commit-ready checkpoint: status/diff summary, checks, review result, and proposed Conventional Commit message.

## Checks

Use `testing-strategy.md` as the normative policy and `diff-aware-testing.md` to map a diff to focused behavioral checks.

Default order:

- smallest applicable repository-native lint/format-policy check;
- smallest applicable type-check;
- single related test or red-capable repro;
- related package/workspace test when the narrower check cannot bind the claim;
- integration/E2E/race/load/stress only for a named boundary or risk;
- full suite only for a repository-required, explicitly requested, or release gate.

Use repository conventions from `AGENTS.md`, `CONTRIBUTING.md`, README, workspace/build manifests, CI, and existing scripts. Do not assume Node/npm or add a linter solely to satisfy the ordering rule. For monorepos, prefer the smallest affected workspace commands; use root-wide checks only when required by the ticket or repository gate. Run sequentially by default and preserve failure attribution.

## Subagents

Every launch follows `delegation-policy.md`; do not invent local context, acceptance, routing, budget, or evidence defaults here. Use scouts/context-builders for unfamiliar code, a planner for large or risky approved work, one fresh async writer with the active-tree lease, then fresh review after a stable handoff. The parent verifies evidence, synthesizes fixes through one writer, and resolves or escalates unapproved decisions.

## Constraints

- Do not commit unless explicitly asked or the user confirms the commit-ready checkpoint.
- Do not run destructive commands without approval.
- Prefer small reversible edits.
- Keep final summary evidence-based.
- Keep one logical ticket/slice per commit; separate harness changes from product app changes when practical.

## Final Summary

Use `completion-evidence.md`. Happy path: one terse line plus proposed commit. Expand only failures, blockers, decisions, residual risks, or unverified areas.

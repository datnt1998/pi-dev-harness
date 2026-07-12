# Implementation and TDD

Use this reference when implementing an approved spec or ticket.

## Preconditions

Before editing:

- Confirm the target spec/ticket or user-approved plan.
- Identify affected files and test surfaces.
- If unclear, use `scout` or ask a targeted question.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing tests, write down the seams under test and confirm them with the user (or the ticket's acceptance criteria). Agreeing the seams up front puts testing effort on critical paths and complex logic instead of every edge case. Ask: "What's the public interface, and which seams should we test?"

For what makes a test good or bad (implementation-coupled, tautological, horizontal slicing) and when to mock, read `tests-and-mocking.md` (same directory). For designing the module shape itself, use `/skill:codebase-design`.

## Validation Contract

Before implementation, state the smallest useful contract:

- expected behavior and non-goals;
- acceptance checks and test seams;
- commands or user flows to exercise;
- evidence the writer must return, including failures and residual risks.

## Implementation Loop

1. Pick the smallest vertical slice.
2. If feasible, write or update a failing test first — **red before green**; watch it fail, then write only enough code to pass. No speculative features.
3. Make the minimal code change.
4. Run the narrowest useful check.
5. Refactor only after green feedback (heavier refactoring belongs to the review stage, not the red→green cycle).
6. Repeat — one seam, one test, one minimal implementation per cycle.
7. Run broader checks near the end and collect validation-contract evidence.
8. Run fresh-context code review, synthesize findings, and apply in-scope fixes with one writer. Re-review substantial fixes.
9. Inspect the final diff and validation evidence before summarizing.
10. Use `/skill:git-rules` to prepare a commit-ready checkpoint: status/diff summary, checks, review result, and proposed Conventional Commit message.

## Checks

Prefer, in order:

- single test file
- related package test
- typecheck
- lint
- full test suite

Use repository conventions from `package.json`, README, AGENTS.md, or existing scripts.

## Subagents

Useful patterns:

- Use fresh `scout`/`context-builder` before touching unfamiliar code.
- Use `planner` for large or risky changes.
- Launch one async, normally forked `worker` only after plan/spec approval; the parent must not edit the same worktree concurrently.
- After the worker handoff, launch async fresh-context reviewers for Standards and Spec/validation.
- Preserve reviewer reports separately, then let the parent synthesize fixes; use one writer for the fix pass.
- Use forked advisory `oracle` for risky architecture decisions or context drift.
- Children escalate unapproved decisions through supervisor/intercom instead of guessing.

## Constraints

- Do not commit unless explicitly asked or the user confirms the commit-ready checkpoint.
- Do not run destructive commands without approval.
- Prefer small reversible edits.
- Keep final summary evidence-based.
- Keep one logical ticket/slice per commit; separate harness changes from product app changes when practical.

## Final Summary

Include:

- files changed
- behavior changed
- checks run and results
- review result
- unverified areas
- proposed Conventional Commit message from `/skill:git-rules`
- next recommended action

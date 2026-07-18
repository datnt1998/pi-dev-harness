---
name: ticket-readiness
description: Validate and clean a ticket file before autonomous or batch implementation. Use when the user asks to prepare, groom, clean, or check tickets, or before running /implement-all so raw tickets are gated into READY/AUTO_FIXED/NEEDS_DECISION/BLOCKED with an execution manifest and readiness report.
---

# Ticket Readiness Gate

Use this skill to inspect or persist the deterministic gate before a batch. `/implement-all` may accept raw tickets because the packaged runner re-gates the live source before execution; only READY/AUTO_FIXED tickets run.

The deterministic parser/classifier ships at `../../lib/ticket-readiness.ts` relative to this skill. Use it as the source of truth; do not hand-classify.

## When to Use

- The user asks to prepare, groom, clean, validate, or check tickets.
- Before `/implement-all`, or whenever a ticket source file changed.
- When a batch run reports a fingerprint mismatch and must re-gate.

## Statuses

- `READY` — all required fields present and usable.
- `AUTO_FIXED` — only mechanical gaps were fixed; every change is reported.
- `NEEDS_DECISION` — missing product/architecture/scope intent; ask the user.
- `BLOCKED` — unknown/self/cyclic dependency, missing environment/credential, or contradicts the spec.

Only `READY` and `AUTO_FIXED` tickets are runnable.

## Required Ticket Fields

```markdown
## T<id> — <title>

Goal:
Scope:
Working directory:    (optional for single-root; recommended/required by overlay for monorepos)
Non-goals:            (optional)
Dependencies:         none | T2, T3
Acceptance criteria:  (>=1 testable bullet)
Validation:           (>=1 command or "manual: ...")
Risks:                (optional)
Done when:            (>=1 bullet)
```

## Allowed Auto-Fixes

- Normalize ids/order and dependency formatting.
- Fill `Validation` from an unambiguous discovered repository script only when the ticket already references a check such as test/build/lint/typecheck. The packaged automatic candidate discovery currently reads `package.json` scripts; other ecosystems should record explicit commands rather than guessing.
- Derive `Done when` as "All acceptance criteria pass." when acceptance criteria exist.
- Split an oversized ticket only when it already lists clear independent vertical slices.
- De-duplicate identical tickets.

## Forbidden Auto-Changes

- Inventing product behavior, API shapes, or data models.
- Rewriting declared scope or acceptance intent.
- Resolving contradictions with the spec.
- Adding destructive/migration steps.

Non-measurable acceptance criteria are flagged and escalated to `NEEDS_DECISION`, not silently rewritten.

## Procedure

1. Read the ticket source file the user names.
2. Read the project setup contract and repository-native validation commands. Pass `package.json` scripts as `repoScripts` when present; for other ecosystems preserve explicit ticket commands and do not invent an auto-fix.
3. Resolve this skill's directory, then run `node --experimental-strip-types <skill-dir>/../../lib/gate-run.ts <tickets.md>`. It prints statuses, order, cycles, warnings, and fingerprint; non-zero means decisions/blockers remain. Do not create an ad-hoc classifier.
4. Write two artifacts under `.scratch/<batch>/`:
   - `execution-manifest.md` — fingerprint header comment, ordered runnable tickets with normalized fields and recorded auto-fixes.
   - `readiness-report.md` — per-ticket status, issues, and auto-fixes; a summary count; and the list of tickets needing decisions or blocked.
5. Deduplicate all `NEEDS_DECISION` questions into one numbered batch with affected tickets and recommended safe defaults. Report structural blockers without inventing fixes.
6. A persisted manifest is optional for auditability; `/implement-all` always re-gates live source and proceeds with independent runnable tickets.

## Manifest Header

Begin `execution-manifest.md` with:

```markdown
<!-- execution-manifest fingerprint=<sha256> source="<path>" generated=<iso8601> -->
```

Quote `source` so paths may contain spaces. The fingerprint records the gated source. `/implement-all` always re-gates the live source when it starts (it never trusts a stale manifest) and stores a fresh fingerprint in run state. If the source changes, re-run this skill so the manifest and report stay in sync with what the runner will execute.

## Handoff

Happy path: one terse line with source, runnable count/order, and artifact paths. Expand only decisions, blockers, auto-fixes, or fingerprint drift.

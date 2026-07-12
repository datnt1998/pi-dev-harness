---
name: ticket-readiness
description: Validate and clean a ticket file before autonomous or batch implementation. Use when the user asks to prepare, groom, clean, or check tickets, or before running /implement-all so raw tickets are gated into READY/AUTO_FIXED/NEEDS_DECISION/BLOCKED with an execution manifest and readiness report.
---

# Ticket Readiness Gate

Use this skill to turn a raw ticket file into a gated execution manifest before any autonomous or batch implementation. It is the mandatory cleaning step: never feed raw tickets straight into `/implement-all`.

The deterministic parser/classifier lives in `.pi/lib/ticket-readiness.ts`. Use it as the source of truth; do not re-derive statuses by prose judgment.

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
Non-goals:            (optional)
Dependencies:         none | T2, T3
Acceptance criteria:  (>=1 testable bullet)
Validation:           (>=1 command or "manual: ...")
Risks:                (optional)
Done when:            (>=1 bullet)
```

## Allowed Auto-Fixes

- Normalize ids/order and dependency formatting.
- Fill `Validation` from an unambiguous repo script (`package.json` scripts) only when the ticket already references a check such as test/build/lint/typecheck.
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
2. Read `package.json` scripts to pass as `repoScripts` for validation auto-fill.
3. Run the persisted gate runner: `node --experimental-strip-types .pi/lib/gate-run.ts <tickets.md>`, which calls `analyzeBatch` from `.pi/lib/ticket-readiness.ts` and prints statuses, order, cycles, warnings, and the fingerprint. It exits non-zero when any ticket is BLOCKED/NEEDS_DECISION. (The runner lives under the local `.pi/` harness — not a tracked npm script — so the shared repo stays free of local-harness coupling.) Do not hand-classify; do not re-create an ad-hoc temp script.
4. Write two artifacts under `.scratch/<batch>/`:
   - `execution-manifest.md` — fingerprint header comment, ordered runnable tickets with normalized fields and recorded auto-fixes.
   - `readiness-report.md` — per-ticket status, issues, and auto-fixes; a summary count; and the list of tickets needing decisions or blocked.
5. For any `NEEDS_DECISION`, ask the user concise, batched questions. For any `BLOCKED`, report the structural cause; do not attempt to invent a fix.
6. Only after the manifest exists should `/implement-all` proceed, and only on runnable tickets.

## Manifest Header

Begin `execution-manifest.md` with:

```markdown
<!-- execution-manifest fingerprint=<sha256> source=<path> generated=<iso8601> -->
```

The fingerprint records the gated source. `/implement-all` always re-gates the live source when it starts (it never trusts a stale manifest) and stores a fresh fingerprint in run state. If the source changes, re-run this skill so the manifest and report stay in sync with what the runner will execute.

## Handoff

Report: source path, artifact paths, status summary, runnable ticket order, decisions needed, and whether the batch may proceed.

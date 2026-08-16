# Autonomous Execution Contract

Minimize user work without widening authority.

## Approval envelope

A user-approved spec, ticket, manifest, or explicit task authorizes reversible work inside its stated scope:

`inspect → implement → validate → independent review → scoped fixes → re-review when substantial → commit-ready checkpoint`

Do not ask again between these steps. Infer mechanical details from repository evidence. Batch questions instead of interrupting one-by-one.

Commit permission is separate. `--commit` authorizes only precise commits for validated approved work; it never authorizes push, publish, release, deploy, migration, credentials, destructive cleanup, or scope expansion.

## Stop conditions

Stop and request one batched decision when work requires:

- new product, architecture, API, data-model, scope, or acceptance decisions;
- destructive or difficult-to-reverse operations;
- credentials, secrets, permission changes, or a new security/privacy boundary;
- migration, data loss risk, production, deploy, release, publish, or push;
- overwriting unrelated dirty work;
- unresolved validation/review blocker;
- retry or continuation cap;
- a red that recurs without a recorded diagnosis.

Continue independent approved work before stopping. Never guess past a safety boundary.

## Red discipline

A red check is evidence, never noise. An expected TDD red—where the focused guard reaches its assertion and fails for the intended missing behavior—authorizes the minimal implementation and is not a retry. For a wrong-reason, pre-existing, flaky, unrelated, environment, or recurring red, read and preserve its output, diagnose it to root cause before touching it again, and record the corrective action or evidenced transient policy before any bounded retry. Never re-roll a red hoping it turns green. Never weaken, delete, skip, quarantine, loosen, replace, or reduce the fidelity of a valid guard merely to make CI pass; snapshot/golden updates require independent confirmation that the new output is intended. Once a recorded flake is fixed, its color is believed again — re-rolling a repaired check is a violation, not caution. See `testing-strategy.md` and `diagnosing-bugs.md`; this section does not restate them.

## Questions

Ask only blocking questions. One numbered batch; each item includes:

- affected scope/tickets;
- why blocked;
- recommended safe default;
- consequence of choosing otherwise.

## Reporting

Final user-facing prose follows `response-shape.md`, the single normative shape contract; this section fixes only the autonomous status line. Happy path, shortest useful form:

`✓ <scope> · tests/build/review pass · files <N> · risk none`

Fragments are acceptable. Recurring state stays in the TUI/status, not prose, and no user next step is invented while approved work remains. Preamble/closer, tangents, wins, failures, list completeness, and scope units all defer to `response-shape.md`.

# Testing Strategy

Use this reference during `implement`, `code-review`, `diagnose`, and release validation to choose the right checks, at the right layer, at the right time.

## Ownership boundary

Test behavior the application owns through its public seams. A check should prove an observable contract, invariant, compatibility promise, or failure mode that this repository is responsible for.

Do not add or run broad tests merely to exercise framework, language, database, browser, or vendor behavior the application does not own. When external behavior matters, test the application's adapter contract and use the appropriate integration or smoke gate to prove the real boundary.

## Default validation ladder

Validation is an evidence ladder, not a ritual checklist. Discover repository-native commands and run them sequentially by default so each failure has clear attribution.

1. **Static checks first** — run the smallest applicable lint/format-policy and type-check commands before behavioral tests. If the repository has neither, record that fact rather than inventing a tool or command.
2. **Smallest related behavioral test** — run the single test, test file, package test, or red-capable repro that owns the changed behavior.
3. **Integration tests only when needed** — expand when the change crosses real module, process, persistence, network, package, or extension boundaries; when a focused double declares tier blindness; or when narrower evidence cannot bind an acceptance criterion.
4. **Full suite only at a release or repository-required gate** — run it when the user requests it, repository policy/CI defines it as mandatory, the diff changes high-fan-out shared infrastructure or test/config machinery, or release/version/publish work requires it. Ordinary feature completion does not imply a full-suite run.

Start with static checks does not prohibit TDD. Run the static preflight before editing when practical; then a red test may be written before production implementation. The TDD red must fail for the intended missing behavior or exact symptom—syntax errors, broken fixtures, harness failures, and unrelated type errors do not count. A compiler/static failure can be the behavioral guard when the approved contract is itself compile-time or type-level. Diagnosis may begin with an already-established tighter repro. Re-run affected static checks after edits before completion.

## Escalation is evidence-driven

Escalate one layer only when the previous layer cannot prove the claim or the changed boundary requires broader evidence.

Examples:

- A pure function change with a direct test usually stops at static checks plus that test file.
- A persistence adapter change needs the focused adapter test and may need a real-database integration test if refusal, query, transaction, or serialization semantics are load-bearing.
- A package manifest, shared test helper, compiler config, or high-fan-out public barrel may require broader package/workspace checks; it does not automatically require every repository test unless the repository gate says so.
- A release gate may require the full declared matrix, packaging smoke, or consumer smoke even when the implementation diff is small.

Report every mapped acceptance criterion that remains unverified. Never silently substitute a broader green suite for a missing direct guard.

## Sequential by default

Run checks sequentially unless they are demonstrably independent and parallel execution materially improves the task without obscuring attribution or contending for shared resources.

Keep these sequential unless the repository explicitly isolates them:

- tests sharing a database, filesystem fixture, port, cache, snapshot, or mutable service;
- migration and rollback checks;
- race/load/stress runs;
- checks whose output must diagnose the previous failure.

If checks run in parallel, record why they are independent and preserve each command's separate result.

## Specialized tests are intentional tools

Use specialized tests only for a named risk or acceptance criterion:

- **E2E** — critical user journeys or browser/system wiring that lower layers cannot prove.
- **Race/concurrency** — ordering, locking, cancellation, idempotency, or shared-state hazards.
- **Load** — expected throughput, latency, or capacity against a stated workload and threshold.
- **Stress/soak** — behavior beyond expected limits, degradation, recovery, leaks, or long-duration stability.

Before running one, state the risk, environment, workload/seed, duration or iteration bound, threshold/oracle, and cleanup plan. A specialized test without these is activity, not evidence.

## Failure and retry discipline

A red check is evidence. Read its output, classify the failure, and fix or escalate the root cause before rerunning it.

Never:

- retry blindly or reroll a flaky command hoping for green;
- weaken, delete, skip, quarantine, loosen assertions, reduce fidelity, or widen tolerances merely to make CI pass;
- update snapshots or golden files without independently verifying that the new output is intended;
- replace a correct integration guard with a weaker unit fake;
- report a later green run without preserving the earlier failure and its diagnosis.

Classify reds before proceeding:

- **Expected TDD red** — a new/changed focused guard reaches its assertion and fails for the intended missing behavior; proceed to the minimal implementation without a separate bug-diagnosis cycle.
- **Unexpected red** — wrong failure reason, pre-existing failure, flake, unrelated regression, environment failure, or a recurring failure after a fix; follow `diagnosing-bugs.md` before rerunning.

A retry is allowed only after a recorded reason: an identified code/config/environment fix, or a known transient with evidence and a bounded retry policy. If a failure is outside the approved scope, preserve it as a blocker or residual risk; do not edit the test to hide it.

## Selection record

Record the plan and outcome compactly:

```text
Validation selection:
  Owned behavior: <public seam / acceptance criterion>
  Static: <commands or unavailable>
  Focused: <smallest related test/repro>
  Integration: not-needed | <command + reason>
  Full suite: not-needed | <command + gate reason>
  Specialized: not-needed | <kind, risk, workload, oracle>
  Execution: sequential | parallel (<independence reason>)
  Test cycle: not-applicable (<reason>) | red <command + expected reason> → green <same command>
  Failures/retries: none | <unexpected failure → diagnosis → corrective action → bounded rerun>
```

The goal is not fewer tests. The goal is the right tests, at the right layer, at the right time.
